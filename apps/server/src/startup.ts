import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function detectOS() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

export function getStartupDir() {
  return path.join(os.homedir(), ".linkra", "startup");
}

export function createStartupAssets(rootDir: string, port: number) {
  const dir = getStartupDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const macScript = `#!/bin/zsh\ncd \"${rootDir}\"\nif [ ! -d node_modules ]; then\n  npm install\nfi\nnpm run build\nif lsof -i tcp:${port} -sTCP:LISTEN >/dev/null 2>&1; then\n  exit 0\nfi\n(sleep 2 && open \"http://localhost:${port}\") &\nnpm run start\n`;

  const winScript = `@echo off\ncd /d \"${rootDir}\"\nif not exist node_modules (\n  npm install\n)\nnpm run build\nstart \"Linkra\" http://localhost:${port}\nnpm run start\n`;

  const plist = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>com.jahrix.linkra</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/zsh</string>\n    <string>-lc</string>\n    <string>${path.join(dir, "linkra_start.sh")}</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>StandardOutPath</key>\n  <string>${path.join(dir, "linkra_start.out.log")}</string>\n  <key>StandardErrorPath</key>\n  <string>${path.join(dir, "linkra_start.err.log")}</string>\n</dict>\n</plist>\n`;

  const taskXml = `<?xml version=\"1.0\" encoding=\"UTF-16\"?>\n<Task version=\"1.4\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\n  <RegistrationInfo>\n    <Name>LinkraLocal</Name>\n  </RegistrationInfo>\n  <Triggers>\n    <LogonTrigger>\n      <Enabled>true</Enabled>\n    </LogonTrigger>\n  </Triggers>\n  <Principals>\n    <Principal id=\"Author\">\n      <RunLevel>LeastPrivilege</RunLevel>\n    </Principal>\n  </Principals>\n  <Settings>\n    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\n    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\n    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\n    <AllowHardTerminate>false</AllowHardTerminate>\n    <StartWhenAvailable>true</StartWhenAvailable>\n  </Settings>\n  <Actions Context=\"Author\">\n    <Exec>\n      <Command>${path.join(dir, "linkra_start.cmd")}</Command>\n    </Exec>\n  </Actions>\n</Task>\n`;

  const systemdService = `[Unit]\nDescription=Linkra Local Dashboard\n\n[Service]\nType=simple\nWorkingDirectory=${rootDir}\nExecStart=/usr/bin/env bash -lc \"npm run build && npm run start\"\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n`;

  fs.writeFileSync(path.join(dir, "linkra_start.sh"), macScript, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "linkra_start.cmd"), winScript);
  fs.writeFileSync(path.join(dir, "linkra_macos.plist"), plist);
  fs.writeFileSync(path.join(dir, "linkra_windows.xml"), taskXml);
  fs.writeFileSync(path.join(dir, "linkra_systemd.service"), systemdService);

  return {
    dir,
    files: [
      path.join(dir, "linkra_start.sh"),
      path.join(dir, "linkra_start.cmd"),
      path.join(dir, "linkra_macos.plist"),
      path.join(dir, "linkra_windows.xml"),
      path.join(dir, "linkra_systemd.service")
    ]
  };
}

export function startupInstructions(osType: string, dir: string, port: number) {
  if (osType === "macos") {
    return `1. Copy ${path.join(dir, "linkra_macos.plist")} to ~/Library/LaunchAgents/\n2. In Terminal: launchctl load -w ~/Library/LaunchAgents/linkra_macos.plist\n3. Linkra will open at http://localhost:${port} on login.`;
  }
  if (osType === "windows") {
    return `1. Open Task Scheduler\n2. Import task: ${path.join(dir, "linkra_windows.xml")}\n3. When prompted, keep "Run only when user is logged on".\n4. Linkra will open at http://localhost:${port} on login.`;
  }
  return `Linux detected. Copy ${path.join(dir, "linkra_systemd.service")} to ~/.config/systemd/user/\nThen run: systemctl --user enable --now linkra_systemd.service\nLinkra will open at http://localhost:${port} on login.`;
}
