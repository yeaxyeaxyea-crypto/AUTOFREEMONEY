function fail(error) {
  if (error) throw new Error(error.message || 'Supabase could not save the task.');
}

export async function saveCommand(supabase, user, task) {
  if (!user?.id) throw new Error('Sign in to save commands to your base.');

  let { data: workspaces, error } = await supabase.from('workspaces').select('id').limit(1);
  fail(error);
  let workspaceId = workspaces?.[0]?.id;
  if (!workspaceId) {
    const created = await supabase.from('workspaces').insert({ name: 'AUTO FREE MONEY', owner_id: user.id }).select('id').single();
    fail(created.error);
    workspaceId = created.data.id;
  }

  let projectQuery = supabase.from('projects').select('id');
  if (typeof projectQuery.eq === 'function') projectQuery = projectQuery.eq('workspace_id', workspaceId);
  const projectResult = await projectQuery.limit(1);
  fail(projectResult.error);
  let projectId = projectResult.data?.[0]?.id;
  if (!projectId) {
    const created = await supabase.from('projects').insert({ workspace_id: workspaceId, name: 'Command Center', created_by: user.id }).select('id').single();
    fail(created.error);
    projectId = created.data.id;
  }

  const saved = await supabase.from('tasks')
    .insert({ project_id: projectId, title: task, input: { prompt: task } })
    .select('id')
    .single();
  fail(saved.error);
  return saved.data.id;
}

export async function loadTasks(supabase) {
  const { data, error } = await supabase.from('tasks')
    .select('id,title,status,output,error,created_at')
    .order('created_at', { ascending: false }).limit(20);
  fail(error);
  return data || [];
}

export async function runSavedTask(supabase, task, request = fetch) {
  if (task.status !== 'pending') throw new Error('Only pending tasks can be run.');
  const { data, error } = await supabase.auth.getSession();
  fail(error);
  if (!data?.session?.access_token) throw new Error('Sign in before running a task.');
  const reply = await request('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ task: task.title, taskId: task.id })
  });
  const payload = await reply.json().catch(() => ({}));
  if (!reply.ok) throw new Error(payload.error || 'Could not run the saved task.');
  return payload.result;
}
