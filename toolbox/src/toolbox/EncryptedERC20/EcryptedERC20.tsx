"use client";

import { Step, Steps } from "fumadocs-ui/components/steps";
import { Container } from "../../components/Container";
import { Button } from "../../components/Button";
import { Success } from "../../components/Success";
import { Checkbox } from "../../components/Checkbox";
import { useMemo, useState } from "react";
import { useErrorBoundary } from "react-error-boundary";
import { useToolboxStore, useViemChainStore } from "../../stores/toolboxStore";
import { useWalletStore } from "../../stores/walletStore";

// Contract ABIs
import RegistrationVerifierABI from "../../../contracts/EncryptedERC/RegistrationVerifier.json";
import WithdrawVerifierABI from "../../../contracts/EncryptedERC/WithdrawVerifier.json";
import TransferVerifierABI from "../../../contracts/EncryptedERC/TransferVerifier.json";
import MintVerifierABI from "../../../contracts/EncryptedERC/MintVerifier.json";
import RegistrarABI from "../../../contracts/EncryptedERC/Registrar.json";
import BabyJubJubABI from "../../../contracts/EncryptedERC/BabyJubJub.json";
import EncryptedERCABI from "../../../contracts/EncryptedERC/EncryptedERC.json";

// Types
interface TokenConfig {
  registrar: string;
  mintVerifier: string;
  withdrawVerifier: string;
  transferVerifier: string;
  name: string;
  symbol: string;
  decimals: number;
  isConverter: boolean;
}

type ContractType =
  | "REGISTRATION"
  | "WITHDRAW"
  | "TRANSFER"
  | "MINT"
  | "REGISTRAR"
  | "BABYJUBJUB"
  | "EERC";

// Constants
const VERIFIER_CONTRACTS = {
  REGISTRATION: RegistrationVerifierABI,
  WITHDRAW: WithdrawVerifierABI,
  TRANSFER: TransferVerifierABI,
  MINT: MintVerifierABI,
} as const;

// Utilities
const linkBytecode = (libraryAddress: string): string => {
  const bytecode = EncryptedERCABI.bytecode as string;
  return bytecode.replace(
    new RegExp("__\\$3599097dbd61087c0ceb2349e224575c52\\$__", "g"),
    libraryAddress.replace(/^0x/, "").toLowerCase()
  );
};

const EncryptedERC20 = () => {
  const { showBoundary } = useErrorBoundary();
  const viemChain = useViemChainStore();
  const { coreWalletClient, publicClient } = useWalletStore();

  // Store state
  const {
    registrationVerifierAddress,
    setRegistrationVerifierAddress,
    mintVerifierAddress,
    setMintVerifierAddress,
    withdrawVerifierAddress,
    setWithdrawVerifierAddress,
    transferVerifierAddress,
    setTransfterVerifierAddress,
    registrarAddress,
    setRegistrarAddress,
    babyJubJubAddress,
    setBabyJubJubAddress,
    encryptedERCAddress,
    setEncryptedERCAddress,
    encryptedERCDecimal,
    encryptedERCIsConverter,
    encryptedERCTokenName,
    encryptedERCSymbol,
    setEncryptedERCDecimal,
    setEncryptedERCIsConverter,
    setEncryptedERCSymbol,
    setEncryptedERCTokenName,
  } = useToolboxStore();

  // Local state
  const [deployingLibraries, setDeployingLibraries] = useState(false);
  const [deployingEncryptedERC, setDeployingEncryptedERC] = useState(false);

  // Contract address setters mapping
  const setContractAddress = (type: ContractType, address: string) => {
    const setters = {
      REGISTRATION: setRegistrationVerifierAddress,
      WITHDRAW: setWithdrawVerifierAddress,
      TRANSFER: setTransfterVerifierAddress,
      MINT: setMintVerifierAddress,
      REGISTRAR: setRegistrarAddress,
      BABYJUBJUB: setBabyJubJubAddress,
      EERC: setEncryptedERCAddress,
    } as const;

    setters[type]?.(address);
  };

  // Reset all library addresses
  const resetLibraryAddresses = () => {
    setRegistrationVerifierAddress("");
    setWithdrawVerifierAddress("");
    setTransfterVerifierAddress("");
    setMintVerifierAddress("");
    setBabyJubJubAddress("");
    setRegistrarAddress("");
  };

  // Wallet chain setup
  const setupWalletChain = async () => {
    await coreWalletClient.addChain({ chain: viemChain });
    await coreWalletClient.switchChain({ id: viemChain!.id });
  };

  // Deploy a single contract
  const deployContract = async (
    abi: any,
    bytecode: string,
    args?: any[],
    contractName: string = "Contract"
  ): Promise<string> => {
    await setupWalletChain();

    const hash = await coreWalletClient.deployContract({
      abi,
      bytecode: bytecode as `0x${string}`,
      chain: viemChain,
      ...(args && { args }),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new Error(`Error deploying ${contractName} contract`);
    }

    return receipt.contractAddress;
  };

  // Deploy verifier contracts
  const deployVerifierContracts = async () => {
    const contractTypes = Object.keys(VERIFIER_CONTRACTS) as Array<keyof typeof VERIFIER_CONTRACTS>;
    const deployedAddresses: Record<string, string> = {};
    
    for (const type of contractTypes) {
      const artifact = VERIFIER_CONTRACTS[type];
      const address = await deployContract(artifact.abi, artifact.bytecode, undefined, `${type} Verifier`);
      setContractAddress(type, address);
      deployedAddresses[type] = address;
    }
    
    return deployedAddresses;
  };

  // Deploy Registrar contract
  const deployRegistrar = async (requiredAddress : string) => {
    if (!requiredAddress) {
      throw new Error("Registration Verifier address not present");
    }

    const address = await deployContract(
      RegistrarABI.abi,
      RegistrarABI.bytecode,
      [requiredAddress],
      "Registrar"
    );

    setContractAddress("REGISTRAR", address);
  };

  // Deploy BabyJubJub library
  const deployBabyJubJub = async () => {
    const address = await deployContract(
      BabyJubJubABI.abi,
      BabyJubJubABI.bytecode,
      undefined,
      "BabyJubJub"
    );

    setContractAddress("BABYJUBJUB", address);
  };

  // Deploy all required contracts
  const deployRequiredContracts = async () => {
    resetLibraryAddresses();

    try {
      const verifierAddresses = await deployVerifierContracts();
      await deployRegistrar(verifierAddresses.REGISTRATION);
      await deployBabyJubJub();
    } catch (error) {
      showBoundary(error);
    }
  };

  // Deploy EncryptedERC token
  const deployEncryptedERCToken = async () => {
    if (!babyJubJubAddress) {
      throw new Error("Required libraries not deployed");
    }

    const tokenConfig: TokenConfig = {
      registrar: registrarAddress,
      mintVerifier: mintVerifierAddress,
      withdrawVerifier: withdrawVerifierAddress,
      transferVerifier: transferVerifierAddress,
      name: encryptedERCTokenName,
      symbol: encryptedERCSymbol,
      decimals: encryptedERCDecimal,
      isConverter: encryptedERCIsConverter,
    };

    try {
      const address = await deployContract(
        EncryptedERCABI.abi,
        linkBytecode(babyJubJubAddress),
        [tokenConfig],
        "EncryptedERC"
      );

      setContractAddress("EERC", address);
    } catch (error) {
      showBoundary(error);
    }
  };

  // Event handlers
  const handleDeployLibraries = async () => {
    setDeployingLibraries(true);
    try {
      await deployRequiredContracts();
    } finally {
      setDeployingLibraries(false);
    }
  };

  const handleDeployEncryptedERC = async () => {
    setDeployingEncryptedERC(true);
    try {
      await deployEncryptedERCToken();
    } finally {
      setDeployingEncryptedERC(false);
    }
  };

  // Computed values
  const requiredContractsDeployed = useMemo(() => {
    return Boolean(
      mintVerifierAddress &&
        registrarAddress &&
        withdrawVerifierAddress &&
        transferVerifierAddress &&
        babyJubJubAddress
    );
  }, [
    mintVerifierAddress,
    registrarAddress,
    withdrawVerifierAddress,
    transferVerifierAddress,
    babyJubJubAddress,
  ]);

  const tokenParametersValid = useMemo(() => {
    if(encryptedERCIsConverter){
      return Boolean(
        encryptedERCDecimal !== undefined &&
        encryptedERCDecimal !== null
      )
    }
    return Boolean(
      encryptedERCSymbol &&
        encryptedERCTokenName &&
        encryptedERCDecimal !== undefined &&
        encryptedERCDecimal !== null
    );
  }, [encryptedERCTokenName, encryptedERCSymbol, encryptedERCDecimal]);

  return (
    <Container
      title="Deploy EncrpytedERC20 Contracts"
      description="Deploy the your own EncrpytedERC20 Token"
    >
      <div className="space-y-4">
        <Steps>
          <Step>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold">
                Deploy Required contracts for EncrpytedERC
              </h3>
              <div className="text-sm">
                This will deploy the{" "}
                <code>
                  RegistrationVerifier, MintVerifier, WithdrawalVerifier,
                  TransferVeriferi, Registrar and BabyJubJub
                </code>{" "}
                contract to the EVM network <code>{viemChain?.id}</code>.{" "}
                <code>BabyJub</code> is a library required by the{" "}
                <code>EncryptedERC</code> contract.
              </div>
              <Button
                variant="primary"
                onClick={handleDeployLibraries}
                loading={deployingLibraries}
                disabled={deployingLibraries || !!requiredContractsDeployed}
              >
                Deploy Required Contracts
              </Button>

              {requiredContractsDeployed && (
                <Success
                  label="Required Contracts/Library Deployed"
                  value={babyJubJubAddress}
                />
              )}
            </div>
          </Step>

          <Step>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold">Deploy EncrpytedERC</h3>
              <div className="text-sm">
                This will deploy the <code>EncryptedERC</code> contract to the
                EVM network <code>{viemChain?.id}</code>.<br />
                <div className="flex flex-col gap-2 py-1">
                  <span>
                    <code>RegistrationVerifier</code> contract at address{" "}
                    <code>{registrationVerifierAddress || "Not deployed"}</code>
                  </span>
                  <span>
                    <code>Registrar</code> contract at address{" "}
                    <code>{registrarAddress || "Not deployed"}</code>
                  </span>
                  <span>
                    <code>Withdrawal Verifier</code> contract at address{" "}
                    <code>{withdrawVerifierAddress || "Not deployed"}</code>
                  </span>
                  <span>
                    <code>Transfer Verifier</code> contract at address{" "}
                    <code>{transferVerifierAddress || "Not deployed"}</code>
                  </span>
                  <span>
                    <code>Mint Verifier</code> contract at address{" "}
                    <code>{mintVerifierAddress || "Not deployed"}</code>
                  </span>
                  <span>
                    <code>BabyJubJub</code> library at address{" "}
                    <code>{babyJubJubAddress || "Not deployed"}</code>
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label
                    htmlFor="rewardBasisPoints"
                    className="block text-sm font-medium mb-1"
                  >
                    Decimal
                  </label>
                  <input
                    id="rewardBasisPoints"
                    type="number"
                    min="1"
                    max="255"
                    value={encryptedERCDecimal}
                    onChange={(e) =>
                      setEncryptedERCDecimal(Number(e.target.value))
                    }
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rewardBasisPoints"
                    className="block text-sm font-medium mb-1"
                  >
                    Token Name
                  </label>
                  <input
                    id="rewardBasisPoints"
                    type="text"
                    value={encryptedERCTokenName}
                    placeholder="MyToken"
                    onChange={(e) => setEncryptedERCTokenName(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rewardBasisPoints"
                    className="block text-sm font-medium mb-1"
                  >
                    Token Symbol
                  </label>
                  <input
                    id="rewardBasisPoints"
                    type="text"
                    placeholder="MTK"
                    value={encryptedERCSymbol}
                    onChange={(e) => setEncryptedERCSymbol(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                  />
                </div>
                <Checkbox
                  about="converter"
                  label="Is Coverter Token ?"
                  checked={encryptedERCIsConverter}
                  onChange={setEncryptedERCIsConverter}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleDeployEncryptedERC}
                loading={deployingEncryptedERC}
                disabled={!requiredContractsDeployed || !tokenParametersValid}
                className="mt-1"
              >
                Deploy EncrpytedERC Contract
              </Button>

              {encryptedERCAddress && (
                <Success
                  label="EncryptedERC Address"
                  value={encryptedERCAddress}
                />
              )}
            </div>
          </Step>
        </Steps>
      </div>
    </Container>
  );
};

export default EncryptedERC20;
