import { VercelProxyResponse } from '@vercel/node-bridge/types';
import { createServer, ServerResponse } from 'http';
import { IncomingMessage } from 'http';
import { serializeRequest } from '../utils';
import exitHook from 'exit-hook';
import { addHelpers } from './helpers';
import listen from 'async-listen';
import undici from 'undici';

// @ts-expect-error
import { dynamicImport } from './dynamic-import';

import type { VercelRequest, VercelResponse } from './helpers';

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  useRequire: boolean;
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

async function createServerlessServer(
  userCode: ServerlessFunctionSignature,
  options: ServerlessServerOptions
) {
  const server = createServer((req, res) => {
    if (options.shouldAddHelpers) addHelpers(req, res);
    return userCode(req, res);
  });
  exitHook(server.close);
  return { url: await listen(server) };
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = options.useRequire
    ? require(entrypointPath)
    : await dynamicImport(entrypointPath);

  const server = await createServerlessServer(userCode, options);

  return async function (request: IncomingMessage) {
    const response = await undici.fetch(server.url, {
      redirect: 'manual',
      method: 'post',
      body: await serializeRequest(request),
      //@ts-expect-error
      headers: request.headers,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      encoding: 'utf8',
    };
  };
}
