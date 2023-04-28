const { PoolEnv } = require("./support/PoolEnv");
const ethers = require("ethers");

const toWei = (val) => ethers.utils.parseEther("" + val);

describe("Oracle jobs", () => {
  let env;

  beforeEach(async () => {
    env = new PoolEnv();
    await env.ready();
  });

  it("should be able to trigger the beacon", async () => {
    await env.draw();
  });

  it("should be able to push new draw settings", async () => {
    // await env.poolAccrues({ tickets: 10 });
    numberOfPicks = toWei(1);
    startTimestampOffset = 1;
    endTimestampOffset = 2;

    await env.pushPrizeDistribution({
      drawId: 1,
      startTimestampOffset,
      endTimestampOffset,
      numberOfPicks,
    });
  });
});
