const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
  await resend.emails.send({
    from: "Suryavastra <onboarding@resend.dev>",
    to: email,
    subject: "Your Suryavastra OTP",
    html: `<h2>Your OTP is ${otp}</h2><p>Valid for 5 minutes.</p>`,
  });
};

module.exports = sendOtpEmail;
