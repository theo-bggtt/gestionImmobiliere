// app/routes/_public/logout.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { detruireSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return detruireSession(request);
}

export async function loader({}: LoaderFunctionArgs) {
  return redirect("/");
}
