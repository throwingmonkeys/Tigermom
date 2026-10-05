# Tigermom

Project setup only. No product screens, user data, or live website yet.

- GitHub: https://github.com/throwingmonkeys/Tigermom
- Convex project: https://dashboard.convex.dev/t/throwingmonkeys/tigermom
- Development backend: https://animated-shepherd-226.ap-southeast-2.convex.cloud

## Start working

Open PowerShell:

```powershell
cd C:\Users\sonja\Tigermom
cdx
```

Run `npm run dev` to connect to the development backend. A fresh checkout needs `npm install` and `npx convex dev --configure existing`, choosing the Tigermom project.

Local connection settings are in `.env.local`, which is excluded from GitHub. Never commit keys, passwords, or real people's data.

Database, backend and future website hosting use Convex. Production website hosting and `npm run deploy` will be set up with the first website milestone. Git pushes do not deploy.
