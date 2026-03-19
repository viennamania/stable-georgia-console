import { createThirdwebClient } from "thirdweb";

const clientId =
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID
  || process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID;

if (!clientId) {
  throw new Error(
    "NEXT_PUBLIC_THIRDWEB_CLIENT_ID or NEXT_PUBLIC_TEMPLATE_CLIENT_ID is required",
  );
}

export const thirdwebClient = createThirdwebClient({
  clientId,
});
