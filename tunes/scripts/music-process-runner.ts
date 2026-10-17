import { spawn, type ChildProcess } from "node:child_process";

export interface ChildResult { exitCode: number; signal: NodeJS.Signals | null; stdout: string; stderr: string; }

export interface OwnedProcessRunnerOptions {
  platform?: NodeJS.Platform;
  terminationGraceMs?: number;
  forceKillWaitMs?: number;
  sendUnixGroupSignal?: (child: ChildProcess, signal: NodeJS.Signals) => void | Promise<void>;
}

export class OwnedProcessRunner {
  private readonly children = new Set<ChildProcess>();
  private terminating = false;
  private readonly platform: NodeJS.Platform;
  private readonly terminationGraceMs: number;
  private readonly forceKillWaitMs: number;
  private readonly injectedUnixGroupSignal?: OwnedProcessRunnerOptions["sendUnixGroupSignal"];

  constructor(options: OwnedProcessRunnerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.terminationGraceMs = options.terminationGraceMs ?? 1_000;
    this.forceKillWaitMs = options.forceKillWaitMs ?? 5_000;
    this.injectedUnixGroupSignal = options.sendUnixGroupSignal;
  }

  get activeChildCount(): number {
    return this.children.size;
  }

  async run(file: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv } ): Promise<ChildResult> {
    if (this.terminating) throw new Error("owned process runner is terminating");
    return await new Promise((resolve, reject) => {
      const child = spawn(file, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        detached: this.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.children.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { this.children.delete(child); reject(error); });
      child.once("close", (code, signal) => {
        this.children.delete(child);
        resolve({ exitCode: code ?? 1, signal, stdout, stderr });
      });
    });
  }

  private async waitForClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return await new Promise((resolveClosed) => {
      let settled = false;
      const finish = (closed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off("close", onClose);
        child.off("error", onClose);
        resolveClosed(closed);
      };
      const onClose = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      timer.unref();
      child.once("close", onClose);
      child.once("error", onClose);
      if (child.exitCode !== null || child.signalCode !== null) finish(true);
    });
  }

  private async sendUnixGroupSignal(child: ChildProcess, signal: NodeJS.Signals): Promise<void> {
    if (this.injectedUnixGroupSignal) return await this.injectedUnixGroupSignal(child, signal);
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch { child.kill(signal); }
  }

  async terminateAll(): Promise<void> {
    this.terminating = true;
    const children = Array.from(this.children);
    await Promise.all(children.map(async (child) => {
      if (!child.pid) return;
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (this.platform === "win32") {
        await new Promise<void>((resolve) => {
          const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          killer.once("close", () => resolve());
          killer.once("error", () => resolve());
        });
      } else {
        await this.sendUnixGroupSignal(child, "SIGTERM");
        if (await this.waitForClose(child, this.terminationGraceMs)) return;
        await this.sendUnixGroupSignal(child, "SIGKILL");
      }
      await this.waitForClose(child, this.forceKillWaitMs);
    }));
  }
}
