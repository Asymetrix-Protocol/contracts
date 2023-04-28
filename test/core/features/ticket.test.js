const { PoolEnv } = require("./support/PoolEnv");
const ethers = require("ethers");

const toWei = (val) => ethers.utils.parseEther("" + val);

describe("Tickets", () => {
  let env;

  beforeEach(async () => {
    env = new PoolEnv();
    await env.ready();
  });

  it("should be possible to purchase tickets", async () => {
    await env.buyTickets({ user: 1, tickets: 100 });
    await env.buyTickets({ user: 2, tickets: 50 });
    await env.expectUserToHaveTickets({ user: 1, tickets: 100 });
    await env.expectUserToHaveTickets({ user: 2, tickets: 50 });
  });

  it("should be possible to withdraw tickets", async () => {
    await env.buyTickets({ user: 1, tickets: 100 });

    // they deposited all of their tokens
    await env.expectUserToHaveTokens({ user: 1, tokens: 0 });
    await env.withdraw({ user: 1, tickets: 100 });
  });
});
