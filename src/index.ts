import fetch, { Response } from "node-fetch";

export { EZCrosis } from "./client";

export const isReplId = (replId: string): boolean =>
  !!replId && replId.split("-").length == 5;

export class ReplNotFoundError extends Error {
  user: string;
  repl: string;
}

export const performDataRequest = async (
  user: string,
  repl: string
): Promise<any> => {
  let r: Response | undefined = undefined;
  try {
    r = await fetch(`https://repl.it/data/repls/@${user}/${repl}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ezcrosis",
        "X-Requested-With": "ezcrosis",
      },
    });
    if (r.status !== 200) {
      let text;
      try {
        text = await r.text();
      } catch (e) {
        text = "";
      }
      throw new Error(
        `Got invalid status ${
          r.status
        } while fetching data for @${user}/${repl}, data: ${JSON.stringify(
          text
        )}`
      );
    }
    const text = await r.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Invalid JSON while fetching data for @${user}/${repl}: ${JSON.stringify(
          text
        )}`
      );
    }

    return data;
  } catch (e) {
    if (r && r.status === 404) {
      const err = new ReplNotFoundError("Repl not found");
      err.user = user;
      err.repl = repl;
    }
    throw e;
  }
};

export async function getReplId(user: string, slug: string): Promise<string> {
  const data = await performDataRequest(user, slug);

  if (data && data.id && typeof data.id === "string") {
    return data.id;
  }

  throw new Error(`Invalid response received: ${data}`);
}

export async function parseRepl(
  repl: string,
  replIdGetter: (user: string, slug: string) => Promise<string> = getReplId
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

  return await replIdGetter(user, slug);
}
