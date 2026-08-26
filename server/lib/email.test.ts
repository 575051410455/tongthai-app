import { describe, expect, test } from "bun:test";

import { DevTransport, createTransport, emailTransport } from "./email";

describe("email transport seam", () => {
  test("dev transport captures a sent message with recipient, subject, and body intact", async () => {
    const transport = new DevTransport();

    await transport.send({
      to: "somchai@example.com",
      subject: "Verify your email",
      text: "Click here: https://example.com/verify?token=abc",
    });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toEqual({
      to: "somchai@example.com",
      subject: "Verify your email",
      text: "Click here: https://example.com/verify?token=abc",
    });
  });

  test("dev transport captures messages in order and supports optional html", async () => {
    const transport = new DevTransport();

    await transport.send({ to: "a@example.com", subject: "first", text: "1" });
    await transport.send({
      to: "b@example.com",
      subject: "second",
      text: "2",
      html: "<p>2</p>",
    });

    expect(transport.sent.map((m) => m.subject)).toEqual(["first", "second"]);
    expect(transport.sent[1]!.html).toBe("<p>2</p>");
  });

  test("createTransport('dev') returns a capturing transport", async () => {
    const transport = createTransport("dev");

    expect(transport).toBeInstanceOf(DevTransport);
  });

  test("the app-wide transport is selected from env (dev in tests) and captures", async () => {
    expect(emailTransport).toBeInstanceOf(DevTransport);

    await emailTransport.send({
      to: "test@example.com",
      subject: "app-wide",
      text: "captured",
    });

    const dev = emailTransport as DevTransport;
    expect(dev.sent.some((m) => m.subject === "app-wide")).toBe(true);
  });
});
