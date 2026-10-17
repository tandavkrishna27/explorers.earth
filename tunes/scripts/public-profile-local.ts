import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLocalPublicProfileGatewayConfig } from "../server/config/local-public-profile-gateway";
import { startLocalPublicProfileGateway } from "../server/publicProfile/localPublicProfileGatewayApp";
import { StrapiPublicProfileGateway } from "../server/publicProfile/strapiPublicProfileGateway";
import { readLocalPrivateSecret } from "./music-local-state";

export type LocalPublicProfileGatewayArguments = { tokenFile: string; port: number };

export function parseLocalPublicProfileGatewayArguments(args: string[]): LocalPublicProfileGatewayArguments {
  if (!Array.isArray(args) || args.length < 2 || args[0] !== "--token-file" || !args[1] || args[1].startsWith("--")) {
    throw new Error("LOCAL_PUBLIC_PROFILE_GATEWAY_ARGUMENTS");
  }
  if (args.length === 2) return { tokenFile: args[1], port: 5001 };
  if (args.length === 4 && args[2] === "--port" && /^(?:[1-9][0-9]{0,4})$/.test(args[3])) {
    return { tokenFile: args[1], port: Number(args[3]) };
  }
  throw new Error("LOCAL_PUBLIC_PROFILE_GATEWAY_ARGUMENTS");
}

export async function runLocalPublicProfileGateway(args: string[]): Promise<{ shutdown(): Promise<void> }> {
  const parsed = parseLocalPublicProfileGatewayArguments(args);
  const config = resolveLocalPublicProfileGatewayConfig({
    host: "127.0.0.1",
    port: parsed.port,
    origin: "https://api.localqr.earth",
    tokenFile: parsed.tokenFile,
    allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
  });
  return startLocalPublicProfileGateway(config, {
    readToken: (file) => readLocalPrivateSecret(file, { maxBytes: 512 }),
    createGateway: (token) => new StrapiPublicProfileGateway({ origin: config.origin, token, fetchImpl: fetch }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runLocalPublicProfileGateway(process.argv.slice(2)).then((started) => {
    const stop = () => { void started.shutdown().finally(() => process.exit(0)); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    process.stdout.write('{"phase":"started","service":"local-public-profile-gateway"}\n');
  }).catch(() => {
    process.stderr.write("LOCAL_PUBLIC_PROFILE_GATEWAY_REFUSED\n");
    process.exitCode = 1;
  });
}
