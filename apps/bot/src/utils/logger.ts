import pino from "pino";
import { env } from "../config/env.js";

const transport =
  process.env.NODE_ENV === "production"
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      };

export const logger = pino(
  {
    level: env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "*.privateKey",
        "*.private_key",
        "*.secret",
        "*.signature",
        "BOT_WALLET_PRIVATE_KEY",
        "DEFENSE_VAULT_PRIVATE_KEY",
        "REWARDS_VAULT_PRIVATE_KEY",
        "LIQUIDITY_VAULT_PRIVATE_KEY",
        "OPERATIONS_VAULT_PRIVATE_KEY",
        "BURN_VAULT_PRIVATE_KEY",
        "JITO_AUTH_KEYPAIR",
      ],
      remove: true,
    },
  },
  transport ? pino.transport(transport) : undefined,
);

export type Logger = typeof logger;
