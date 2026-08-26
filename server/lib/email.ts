import { authEnv } from "./env";

// The single seam through which every email leaves the system (ADR 0001 /
// better-auth migration spec). All senders depend on EmailTransport only;
// swapping delivery is an env change, never a code change.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

// Dev/test transport: captures instead of delivering, so no SMTP is ever
// needed locally and tests can assert on exactly what would have been sent.
export class DevTransport implements EmailTransport {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    if (authEnv.NODE_ENV !== "test") {
      console.log(
        `[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`
      );
    }
  }
}

export type EmailTransportKind = typeof authEnv.EMAIL_TRANSPORT;

export function createTransport(kind: EmailTransportKind): EmailTransport {
  switch (kind) {
    case "dev":
      return new DevTransport();
  }
}

if (authEnv.isProd && authEnv.EMAIL_TRANSPORT === "dev") {
  console.warn(
    "[email] EMAIL_TRANSPORT=dev in production — emails are captured, NOT delivered"
  );
}

export const emailTransport: EmailTransport = createTransport(
  authEnv.EMAIL_TRANSPORT
);
