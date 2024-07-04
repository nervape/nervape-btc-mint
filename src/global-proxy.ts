import { setGlobalDispatcher, ProxyAgent } from "undici";
if (process.env.HTTP_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTP_PROXY!));
}