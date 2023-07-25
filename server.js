import { createServer } from "node:http";
import Consul from "consul";
import { nanoid } from "nanoid";
import portfinder from "portfinder";

const serviceType = process.argv[2];
const { pid } = process;

async function main() {
  const consulClient = new Consul();
  const port = await portfinder.getPortPromise();
  let serviceId = null;
  const address = process.env.ADDRESS || "localhost";

  function registerService() {
    if (!serviceId) {
      serviceId = nanoid();
    }
    return consulClient.agent.service
      .register({
        id: serviceId,
        name: serviceType,
        address,
        port,
        tags: [serviceType],
      })
      .then(
        () => {
          console.log(`${serviceType} registered successfully`);
        },
        (err) => {
          console.log(err);
          serviceId = null;
        }
      );
  }

  function deregisterService(retry = 3) {
    if (!serviceId) {
      return Promise.resolve();
    }

    if(retry === 0) {
      serviceId = null;
      return Promise.resolve();
    }

    console.log(`Deregistering Service ${serviceType} with id ${serviceId}`);
    return consulClient.agent.service.deregister(serviceId).then(() => {
      serviceId = null;
    }, err => {
      console.log(err);
      deregisterService(--retry);
    })
  }

  process.on("exit", () => {
    deregisterService();
  });
  
  process.on("uncaughtException", (err) => {
    console.log(err);
    deregisterService().then(() => {
      process.exit(1);
    });
  });
  process.on("SIGINT", () => {
    deregisterService().then(() => {
      process.exit(1);
    })
  });

  const server = createServer((req, res) => {
    let i = 1e7;
    while (i > 0) {
      i--;
    }
    console.log(`Handling request from ${pid}`);
    res.end(`${serviceType} response from ${pid}\n`);
  });

  registerService()
    .then(() => {
      server.listen(port, address, () => {
        console.log(`Started ${serviceType} at ${pid} on port ${port}`);
      });
    })
    .catch((err) => {
      process.exit(1);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
