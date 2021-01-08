import fetch, { Response } from "node-fetch";

export { EZCrosis } from "./client";

export const isReplId = (replId: string): boolean =>
  !!replId && replId.split("-").length == 5;

export class ReplNotFoundError extends Error {}

export const performDataRequest = async (
  user: string,
  repl: string
): Promise<string> => {
  let r: Response | undefined = undefined;
  try {
    r = await fetch(`https://repl.it/data/repls/@${user}/${repl}`);
    const data = await r.json();
    return data;
  } catch (e) {
    if (r && r.status === 404) {
      throw new ReplNotFoundError("Repl not found");
    }
    throw e;
  }
};

export async function parseRepl(
  repl: string,
  getReplId: (
    user: string,
    slug: string
  ) => Promise<string> = performDataRequest
): Promise<string | null> {
  // If its a repl id, we're already done
  if (isReplId(repl)) return repl;

  // Check if user included full URL using a simple regex
  const urlRegex = /http(?:s?):\/\/repl\.it\/(.+)/g;
  const match = urlRegex.exec(repl);
  if (match) repl = match[1]; // the first group

  // Split user/author
  const parts = repl.split("/");
  if (parts.length != 2) return null;
  let [user, slug] = parts;

  // Strip out @ from beginning of user
  if (user[0] == "@") user = user.slice(1);
  // user might include the full repl URL with #filename, strip that out
  slug = slug.split("#")[0];

  return getReplId(user, slug);
}
