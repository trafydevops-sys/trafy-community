import type { Metadata } from "next";
import { OtpAuthForm } from "@/components/otp-auth-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a free Trafy Community account — learn new skills, join a community, and get hired.",
};

export default function SignUpPage() {
  return (
    <OtpAuthForm
      heading="Join Trafy Community"
      subheading="Learn new skills, connect with peers, and get hired — no password required, just a 6-digit code."
    />
  );
}
