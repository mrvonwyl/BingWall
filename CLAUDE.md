# Environment

This project is developed on **Windows 11** using **PowerShell 7** exclusively. There is **no Bash** available in this environment — do not suggest or use Bash/POSIX shell syntax (e.g. `ln -s`, `chmod`, `grep`, `export VAR=`, `&&`-chained Unix commands assuming Unix tools, heredocs, etc.). Use PowerShell equivalents instead.

This also means: no WSL. The Stream Deck app and this plugin's Node.js backend process must run natively on Windows — the Stream Deck app has no Linux build, and USB HID access to the physical device would not survive being passed into a WSL2 VM. Do not suggest moving development or execution into WSL.

# Code conventions

Type/interface definitions (e.g. an action's settings type) live in a sibling `*.models.ts` file next to the module that uses them, not inline in the implementation file — e.g. `makro.ts` imports `MakroSettings` from `makro.models.ts`.

Write all code in **TypeScript**, compiled/run as **ESM** (`"type": "module"`, `import`/`export`). Do not use CommonJS (`require`, `module.exports`) or plain `.js` source files — including in throwaway/scratch scripts run via `node -e`.
