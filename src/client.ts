import { Channel, Client } from "@replit/crosis";
import { api } from "@replit/protocol";
import fetch from "node-fetch";

global.WebSocket = require("ws");

/* Listens for event evt on ch
Promise is resolved when an event is received
falsey or <=0 timeout is the same as no timeout
If timeout expires without an event being received, listener is removed and promise is rejected
*/
const waitForCommandTimeout = (
  ch: Channel,
  timeout: number | null | undefined
): Promise<void> =>
  new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let promiseDidFinish = false;

    const listener = () => {
      if (!promiseDidFinish) {
        promiseDidFinish = true;
        clearTimeout(timeoutId);
        resolve();
      }
    };

    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        // Remove listener
        promiseDidFinish = true;
        reject(new Error("Timed out"));
      }, timeout);
    }

    ch.onCommand(listener);
  });

class TokenFetchError extends Error {
  res: unknown;
}

interface ReplIDContext {
  repl: { id: string };
}

class EZCrosis {
  client: Client<ReplIDContext>;
  _token: string;
  channels: Map<string, Channel>;
  connected: boolean;

  constructor() {
    this.client = new Client<ReplIDContext>();
    this.channels = new Map();
    this.connected = false;
  }

  async _getToken(replId: string, apiKey: string): Promise<string> {
    const r = await fetch(`https://repl.it/api/v0/repls/${replId}/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });
    const res: unknown = await r.json();
    if (
      !res ||
      (res as any).status !== 200 ||
      typeof (res as any).data !== "string"
    ) {
      const err = new TokenFetchError(`Invalid token response: ${res}`);
      err.res = res;
      throw err;
    }
    return (res as any).data as string;
  }

  async connect(replId: string, apiKey: string) {
    // save token for later
    this._token = await this._getToken(replId, apiKey);

    // as of 2.1.0
    //await this._client.connect({ token });

    // as of 6.0.0-beta.0
    /*await this._client.connect({
      fetchToken: async () => this._token,
    });*/

    // as of 6.0.4
    await new Promise<void>((res) =>
      this.client.open(
        {
          context: {
            repl: { id: replId },
          },
          fetchToken: async (_abortSignal: AbortSignal) => ({
            token: this._token,
            aborted: false,
          }),
        },
        () => {
          this.connected = true;
          res();
        }
      )
    );
  }

  async channel(name: string): Promise<Channel> {
    const stored = this.channels.get(name);
    if (stored) {
      return stored;
    } else {
      const chan = await new Promise<Channel>((res) =>
        this.client.openChannel({ service: name }, ({ channel }) => {
          if (channel) res(channel);
        })
      );
      this.channels.set(name, chan);
      return chan;
    }
  }

  // FILES

  async read(path: string): Promise<Uint8Array> {
    const filesChan = await this.channel("files");
    let res = await filesChan.request({
      read: {
        path: path,
      },
    });
    if (res.error) {
      throw res.error;
    }
    const { content } = res.file || {};
    if (!content) {
      throw new Error("Missing content after read call");
    }
    return content;
  }

  async write(path: string, contents: string | Buffer) {
    const cBuf = Buffer.from(contents);

    const chan = await this.channel("files");
    return await chan.request({
      write: {
        path: path,
        content: cBuf,
      },
    });
  }

  async listdir(dir: string): Promise<api.File[]> {
    const chan = await this.channel("files");
    return (
      (
        await chan.request({
          readdir: {
            path: dir,
          },
        })
      ).files?.files || []
    );
  }

  // WIP Recursive lister
  async list(dir: string, exclude: string[] = [], prefix: string = "") {
    //console.log("listing", dir);
    let flist: string[] = [],
      dirlist: string[] = [],
      toProcess: api.File[] = await this.listdir(dir);
    for (var i = 0; i < toProcess.length; i++) {
      const file = toProcess[i];
      //console.log(file);
      if (!file.path || exclude.includes(file.path)) {
        //console.log("skipping ", file.path);
      } else if (file.type && (file.type == 1 || file.type == "DIRECTORY")) {
        const newpath = prefix + file.path + "/";
        dirlist.push(newpath);
        const [newfiles, newdirs] = await this.list(newpath, exclude, newpath);
        flist = flist.concat(newfiles);
        dirlist = dirlist.concat(newdirs);
      } else {
        flist.push(prefix + file.path);
      }
    }
    return [flist, dirlist];
  }

  // INTERP2

  async run(timeout: number | null | undefined = null) {
    const ch = await this.channel("shellrun2");
    ch.send({ runMain: {} });
    return await waitForCommandTimeout(ch, timeout);
  }

  async stop(timeout: number | null | undefined = null) {
    const ch = await this.channel("interp2");
    ch.send({ clear: {} });
    return await waitForCommandTimeout(ch, timeout);
  }

  // SNAPSHOT

  async snapshot() {
    const chan = await this.channel("snapshot");

    await chan.request({ fsSnapshot: {} });
  }

  // MISC

  close() {
    this.client.close();
  }
}

export default EZCrosis;
