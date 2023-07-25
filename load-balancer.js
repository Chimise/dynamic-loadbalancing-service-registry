import { createServer } from "http";
import Consul from "consul";
import httpProxy from "http-proxy";

const routing = [
  {
    path: "/api",
    service: "api-service",
    index: 0,
  },
  {
    path: "/",
    service: "webapp-service",
    index: 0,
  },
];

const consulClient = new Consul();
const proxy = httpProxy.createProxyServer();
const cache = new Map();

function getServices() {
  if (cache.has("services")) {
    return cache.get("services");
  }

  const promiseService = consulClient.agent.service.list();
  cache.set("services", promiseService);
  promiseService.then((services) => {
    if (!services) {
      return cache.delete("services");
    }

    setTimeout(() => {
      cache.delete("services");
    }, 1000);
  }, err => {
    cache.delete('services');
  });

  return promiseService;
}

async function main() {
  const server = createServer(async (req, res) => {
    const route = routing.find((route) => req.url.startsWith(route.path));

    try {
      const services = await getServices();
      if (!services) {
        throw new Error("No service found");
      }
      const servers = Object.values(services).filter((service) =>
        service.Tags.includes(route.service)
      );
      if (!servers.length) {
        throw new Error("No server found");
      }

      route.index = (route.index + 1) % servers.length;
      const server = servers[route.index];
      const target = `http://${server.Address}:${server.Port}`;
      proxy.web(req, res, { target });
    } catch (error) {
      res.writeHead(502);
      return res.end("Bad gateway");
    }
  });

  server.listen(8080, () => {
    console.log("Load balancer started on port 8080");
  });
}

main().catch((err) => console.log(err));
