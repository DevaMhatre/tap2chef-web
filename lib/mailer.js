// Sends the sign-in code. In production it goes through Resend; anywhere else
// it is printed to the server console, so local runs need no email account.
// Tests replace `mailer.sendLoginCode`.
export const mailer = {
  async sendLoginCode(email, code) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Sign-in code for ${email}: ${code}`);
      return;
    }
    const { RESEND_API_KEY, MAIL_FROM } = process.env;
    if (!RESEND_API_KEY || !MAIL_FROM) throw new Error("Email is not set up (RESEND_API_KEY, MAIL_FROM)");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: email,
        subject: `${code} is your Tap2Chef code`,
        text: `Your Tap2Chef sign-in code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error(`Email failed: ${response.status}`);
  },
};
