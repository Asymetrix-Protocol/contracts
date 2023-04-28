const fs = require("fs");

const mainnetDeployments = `${__dirname}/../deployments/mainnet`;
const sepoliaDeployments = `${__dirname}/../deployments/sepolia`;
const goerliDeployments = `${__dirname}/../deployments/goerli`;

const networkDeploymentPaths = [];

const CURRENT_VERSION = {
  major: 1,
  minor: 1,
  patch: 0,
};

const contractList = {
  name: "Testnet Linked Prize Pool",
  version: CURRENT_VERSION,
  tags: {},
  contracts: [],
};

const formatContract = (contractName, deploymentBlob) => {
  return {
    chainId: deploymentBlob.chainId,
    address: deploymentBlob.address,
    version: CURRENT_VERSION,
    type: contractName,
    abi: deploymentBlob.abi,
    tags: [],
    extensions: {},
  };
};

checkExistAndPush(mainnetDeployments);
checkExistAndPush(sepoliaDeployments);
checkExistAndPush(goerliDeployments);

networkDeploymentPaths.forEach((networkDeploymentPath) => {
  const contractDeploymentPaths = fs.readdirSync(networkDeploymentPath).filter((path) => path.endsWith(".json"));

  contractDeploymentPaths.forEach((contractDeploymentFileName) => {
    const contractName = contractDeploymentFileName.split(".")[0];
    const contractDeployment = JSON.parse(
      fs.readFileSync(`${networkDeploymentPath}/${contractDeploymentFileName}`, "utf8")
    );

    contractList.contracts.push(formatContract(contractName, contractDeployment));
  });
});

fs.writeFile(`${__dirname}/../contracts.json`, JSON.stringify(contractList), (err) => {
  if (err) {
    console.error(err);

    return;
  } else {
    console.log("DONE!! Check the newly created contracts.json file in the root directory");
  }
});

function checkExistAndPush(folderPath) {
  if (fs.existsSync(folderPath)) {
    networkDeploymentPaths.push(folderPath);
  } else {
    console.warn(
      "Directory does not exist. To generate the contract lists run the deployment script first",
      folderPath
    );
  }
}
