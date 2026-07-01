-- ============================================================================
-- 工作區成員與角色權限 — 後端(Supabase / Postgres)
-- 里程碑範圍:成員邀請(RPC)+ 多工作區「可讀」RLS。
-- 寫入端 RLS 強制(防 viewer/editor 直接打 API 改資料)留待下一個里程碑。
--
-- 在 Supabase 專案的 SQL editor 整段貼上執行。可重複執行(idempotent)。
-- 對應前端:src/hooks/useWorkspaceMembers.js(呼叫 add_workspace_member)、
--          src/hooks/useMemberWorkspaces.js(查全部所屬工作區)。
-- ============================================================================


-- ── 1. 輔助函式 ─────────────────────────────────────────────────────────────
-- RLS 政策若直接在 workspace_members 上 select workspace_members 會無限遞迴,
-- 因此用 SECURITY DEFINER 函式繞過 RLS 來判斷「我是不是這個工作區的成員 / owner」。

-- 目前登入者是否為某工作區成員(任何角色)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  );
$$;

-- 目前登入者在某工作區是否為 owner
create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- 目前登入者是否為某工作區的「擁有者」(看 workspaces.owner_id,不看 members)。
-- 給 onboarding 用:此時 members 還沒有他這一筆,is_workspace_owner 會回 false;
-- 改認 workspaces.owner_id 才能讓他把自己寫成第一筆成員。
-- 一定要 security definer——否則政策內查 workspaces 會被 workspaces 自己的 RLS 擋住
-- (workspaces 的讀取政策要求先是成員,但他此刻還不是)。
create or replace function public.owns_workspace(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspaces
    where id = p_workspace_id
      and owner_id = auth.uid()
  );
$$;


-- ── 2. 新增成員 RPC ─────────────────────────────────────────────────────────
-- 用 email 找出已註冊的使用者,寫入 workspace_members。
-- SECURITY DEFINER:能跨 RLS 讀 profiles / 寫 members,但函式內先自驗呼叫者是 owner,
-- 且不回傳 profiles 內容,避免從 client 直接讀 profiles 列舉 email。
create or replace function public.add_workspace_member(
  p_workspace_id uuid,
  p_email text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  -- 只有該工作區的 owner 能新增成員
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception '只有工作區擁有者能新增成員';
  end if;

  -- 角色限定三種(與前端 ROLE_LABELS / 權限矩陣一致)
  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception '角色不正確';
  end if;

  -- 用 email 找出已註冊的使用者(大小寫不敏感、去空白)
  select id into v_user_id
  from profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception '該 email 尚未註冊';
  end if;

  -- 一人在一工作區只一筆:已存在則更新角色。
  -- p_role 是 text 參數,role 欄位是 member_role enum;plpgsql 內 text→enum 不會隱式轉型
  -- (client 端 .insert() 傳的是 unknown 字面值才會自動吃),所以這裡必須顯式 ::member_role。
  insert into workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, v_user_id, p_role::member_role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;
end;
$$;

-- 開放給登入者呼叫(函式內已自驗 owner)
grant execute on function public.add_workspace_member(uuid, text, text) to authenticated;


-- ── 3. 多工作區「可讀」RLS(只補缺口,不動既有政策)─────────────────────────
-- M3(README §10.8)多半已建立 membership-based 的 SELECT 政策:
--   workspaces / projects → exists(workspace_members) 會員可讀;
--   workspace_members / user_workspace_state → user_id = auth.uid() 讀自己。
-- 這些已足夠讓 useMemberWorkspaces(只查自己的 member 列)與切換工作區運作。
-- 因此這裡用「該表若還沒有 SELECT/ALL 政策才補一條」的守門式做法:
--   - 既有政策(含你先前的 "read own state")→ 跳過,不會再撞名(避免 42710)。
--   - 完全沒有讀政策的表 → 才補上 membership-based 的那條。
-- 絕不 drop 既有政策,故不會誤刪 M3 的寫入端政策。

-- workspaces:會員可讀自己所屬的工作區
do $$
begin
  alter table workspaces enable row level security;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces' and cmd in ('SELECT', 'ALL')
  ) then
    create policy "members read their workspaces"
      on workspaces for select
      using (public.is_workspace_member(id));
  end if;
end $$;

-- projects:會員可讀所屬工作區的專案
do $$
begin
  alter table projects enable row level security;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects' and cmd in ('SELECT', 'ALL')
  ) then
    create policy "members read workspace projects"
      on projects for select
      using (public.is_workspace_member(workspace_id));
  end if;
end $$;

-- workspace_members:至少要讀得到「自己的 member 列」(useMemberWorkspaces 用)
do $$
begin
  alter table workspace_members enable row level security;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members' and cmd in ('SELECT', 'ALL')
  ) then
    create policy "members read own membership"
      on workspace_members for select
      using (user_id = auth.uid());
  end if;
end $$;

-- user_workspace_state:讀自己的列(你已有 "read own state",這裡會自動跳過)
do $$
begin
  alter table user_workspace_state enable row level security;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_workspace_state' and cmd in ('SELECT', 'ALL')
  ) then
    create policy "user reads own state"
      on user_workspace_state for select
      using (user_id = auth.uid());
  end if;
end $$;

-- ── 4. onboarding 自助寫入:owner 把自己寫成第一筆成員 ──────────────────────
-- 缺這條會讓「新使用者註冊」失敗:
--   new row violates row-level security policy for table "workspace_members"
-- 因為第 3 節只開了 SELECT,RLS 啟用後沒有 INSERT 政策的寫入一律被拒。
--
-- 兩個關鍵點(都用 owns_workspace 一次解掉):
--   1. 雞生蛋:此刻使用者還不是成員,不能用 is_workspace_owner 判(會回 false 把自己擋掉),
--      改用 owns_workspace(看 workspaces.owner_id)認身分。
--   2. RLS 坑:政策內若直接 `select from workspaces`,會被 workspaces 自己的 RLS 擋
--      (它要求先是成員)。owns_workspace 是 security definer,繞過該 RLS。
--
-- 只放行「寫自己 + role=owner + 該工作區是我擁有的」,無法藉此把自己塞進別人的工作區。
-- 其餘成員(editor/viewer)一律走 add_workspace_member RPC。
-- 這裡不再用「if not exists 才建」的守門式:直接 drop+create,確保政策一定重建
-- (避免被資料庫裡既有的其他 INSERT/UPDATE 政策讓守門判斷跳過而沒生效)。

-- INSERT:第一次建立 owner 身分
drop policy if exists "owner bootstraps own membership" on workspace_members;
create policy "owner bootstraps own membership"
  on workspace_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.owns_workspace(workspace_id)
  );

-- UPDATE:onboarding 的 upsert 若重送會命中 ON CONFLICT DO UPDATE,
-- 同樣只放行 owner 改自己所屬工作區的那一列,讓重試不再撞 RLS。
drop policy if exists "owner updates own membership" on workspace_members;
create policy "owner updates own membership"
  on workspace_members for update
  using (
    user_id = auth.uid()
    and public.owns_workspace(workspace_id)
  )
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.owns_workspace(workspace_id)
  );

-- 註:寫入端(insert/update/delete)的角色強制(只有 owner 改 workspaces.settings、
-- 只有 owner/editor 改 projects 等)在下一個里程碑補上,屆時搭配 is_workspace_owner /
-- is_workspace_member 寫 with check 政策。


-- ── 5. 成員管理 RPC(設定頁「工作區成員」區塊)──────────────────────────────
-- 三支都 SECURITY DEFINER,理由同 add_workspace_member:
--   * 列成員要 join profiles 拿 display_name,但 profiles 只讓人讀自己那列;
--     workspace_members 的 SELECT 政策也只放行「自己那一列」(第 3 節)。
--     直接從 client 查會兩邊都被 RLS 擋掉,只能靠 definer 函式繞過、函式內先自驗身分。
--   * 改角色 / 踢除是寫入,寫入端角色強制的 RLS 還沒建(見上註),先用 definer 函式
--     在函式內自驗 owner,擋掉非 owner 直接打 API。

-- 5-1. 列出某工作區的全部成員(含 display_name / email / role)。
-- 守門用 is_workspace_member:任何成員都讀得到清單(對應前端「所有成員唯讀」),
-- 只有「改角色 / 踢除」控制項才另外限 owner。
create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, display_name text, email text, role member_role)
language sql
security definer
set search_path = public
stable
as $$
  select member.user_id, profile.display_name, profile.email, member.role
  from workspace_members member
  join profiles profile on profile.id = member.user_id
  where member.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id)
  -- owner 排最前,同角色再依名字,清單順序穩定
  order by (member.role = 'owner') desc, profile.display_name;
$$;

grant execute on function public.list_workspace_members(uuid) to authenticated;

-- 5-2. 踢除成員。只有 owner 能做,且不能踢自己(避免 owner 把自己移除後鎖死工作區)。
create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception '只有工作區擁有者能移除成員';
  end if;

  if p_user_id = auth.uid() then
    raise exception '不能移除自己';
  end if;

  delete from workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- 5-3. 變更成員角色。只有 owner 能做,角色限三值,且不能改自己(避免自我降級鎖死)。
create or replace function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception '只有工作區擁有者能變更成員角色';
  end if;

  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception '角色不正確';
  end if;

  if p_user_id = auth.uid() then
    raise exception '不能變更自己的角色';
  end if;

  -- text→enum 不會隱式轉型,必須顯式 ::member_role(理由同 add_workspace_member)。
  update workspace_members
  set role = p_role::member_role
  where workspace_id = p_workspace_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;
