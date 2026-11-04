interface SendSmsParams {
  phoneNumber: string;
  message: string;
}

export const sendSms = async ({
  phoneNumber,
  message
}: SendSmsParams): Promise<void> => {
  const provider = process.env.SMS_PROVIDER || "console";

  if (provider === "console") {
    console.log("========== SMS (DEVELOPMENT MODE) ==========");
    console.log(`To: ${phoneNumber}`);
    console.log(`Message: ${message}`);
    console.log("============================================");

    return;
  }

  if (provider === "smsapi") {
    throw new Error(
      "SMSAPI.pl integration is not configured yet."
    );
  }

  throw new Error("Unknown SMS provider.");
};