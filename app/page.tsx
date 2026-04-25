export default function Home() {

  const clientId = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID
  const permissions = 8 // Admin
  let inviteUrl = ''
  if (clientId && permissions) inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`

  return (
    <main className="w-full h-screen flex flex-col text-center items-center justify-center bg-background gap-3 md:px-96">
      <h1 className="text-2xl font-bold">UoPeopleSG Bot</h1>
      <p className="text-md">You've landed at the home of the UoPeople Study Group Discord Bot - a purpose-built bot specifically for the UoPeople Study Group discord server.</p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 mb-3">
        <span className="inline-flex items-center rounded-full bg-neutral-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
          Listener: Online
        </span>
        <span className="inline-flex items-center rounded-full bg-neutral-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
          Interactions: Online
        </span>
        <span className="inline-flex items-center rounded-full bg-neutral-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
          Tasks: Online
        </span>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-md"><a href="https://github.com/emjjkk/uopsg-bot" className="text-blue-500">Github Repository</a></p>
        <p className="text-md"><a href={inviteUrl} className="text-blue-500" target="_blank" rel="noopener noreferrer">Invite URL</a></p>
      </div>
    </main>
  );
}
