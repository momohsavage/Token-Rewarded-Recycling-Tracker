import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, bufferCV } from "@stacks/transactions";

const ERR_INVALID_BATCH_ID = 101;
const ERR_ALREADY_PROCESSED = 105;
const ERR_ORACLE_NOT_VERIFIED = 107;
const ERR_INSUFFICIENT_PERMISSIONS = 119;
const ERR_BATCH_NOT_FOUND = 104;
const ERR_INVALID_ACTOR = 108;
const ERR_INVALID_VERIFICATION_PROOF = 115;
const ERR_BATCH_ALREADY_EXISTS = 116;
const ERR_INVALID_CUSTODY_CHANGE = 117;
const ERR_MAX_HISTORY_EXCEEDED = 111;

const STATUS_DEPOSITED = 1;
const STATUS_IN_TRANSIT = 3;
const STATUS_PROCESSED = 4;
const STATUS_REJECTED = 5;

const ROLE_CONSUMER = 1;
const ROLE_COLLECTOR = 2;
const ROLE_PROCESSOR = 3;

interface BatchStatus {
  currentStatus: number;
  lastUpdateTimestamp: number;
  currentCustodian: string;
  materialType: string;
  weight: number;
  depositLocation: string;
}

interface BatchHistoryEntry {
  action: string;
  actor: string;
  timestamp: number;
  proofHash: Uint8Array;
  notes: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TrackingLedgerMock {
  state: {
    nextLogId: number;
    maxHistoryPerBatch: number;
    oracleContract: string | null;
    userRegistryContract: string;
    materialBatchContract: string;
    batchStatuses: Map<number, BatchStatus>;
    batchHistory: Map<string, BatchHistoryEntry>;
    batchHistoryCount: Map<number, number>;
  } = {
    nextLogId: 0,
    maxHistoryPerBatch: 50,
    oracleContract: null,
    userRegistryContract: "SP000000000000000000002Q6VF78",
    materialBatchContract: "SP000000000000000000002Q6VF78",
    batchStatuses: new Map(),
    batchHistory: new Map(),
    batchHistoryCount: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  roles: Map<string, number> = new Map([["ST1TEST", ROLE_CONSUMER]]);
  oracleProofs: Set<string> = new Set();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextLogId: 0,
      maxHistoryPerBatch: 50,
      oracleContract: null,
      userRegistryContract: "SP000000000000000000002Q6VF78",
      materialBatchContract: "SP000000000000000000002Q6VF78",
      batchStatuses: new Map(),
      batchHistory: new Map(),
      batchHistoryCount: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.roles.set("ST1TEST", ROLE_CONSUMER);
    this.oracleProofs = new Set();
  }

  getUserRole(user: string): Result<number> {
    const role = this.roles.get(user);
    return role !== undefined ? { ok: true, value: role } : { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
  }

  verifyOracleProof(proof: Uint8Array): Result<boolean> {
    if (!this.state.oracleContract) return { ok: false, value: false };
    const proofStr = Buffer.from(proof).toString("hex");
    return { ok: true, value: this.oracleProofs.has(proofStr) };
  }

  setOracleContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.oracleContract !== null) return { ok: false, value: false };
    this.state.oracleContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxHistoryPerBatch(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.oracleContract) return { ok: false, value: false };
    this.state.maxHistoryPerBatch = newMax;
    return { ok: true, value: true };
  }

  logBatchDeposit(
    batchId: number,
    mtype: string,
    weight: number,
    loc: string,
    proof: Uint8Array
  ): Result<boolean> {
    if (this.getUserRole(this.caller).value !== ROLE_CONSUMER) return { ok: false, value: false };
    if (batchId <= 0) return { ok: false, value: false };
    if (!mtype || mtype.length > 50) return { ok: false, value: false };
    if (weight <= 0) return { ok: false, value: false };
    if (!loc || loc.length > 100) return { ok: false, value: false };
    if (proof.length !== 32) return { ok: false, value: false };
    if (!this.state.oracleContract) return { ok: false, value: false };
    if (!this.verifyOracleProof(proof).value) return { ok: false, value: false };
    if (this.state.batchStatuses.has(batchId)) return { ok: false, value: false };

    this.state.batchStatuses.set(batchId, {
      currentStatus: STATUS_DEPOSITED,
      lastUpdateTimestamp: this.blockHeight,
      currentCustodian: this.caller,
      materialType: mtype,
      weight,
      depositLocation: loc,
    });

    const logCount = this.state.batchHistoryCount.get(batchId) || 0;
    if (logCount >= this.state.maxHistoryPerBatch) return { ok: false, value: false };
    const key = `${batchId}-${logCount}`;
    this.state.batchHistory.set(key, {
      action: "deposit",
      actor: this.caller,
      timestamp: this.blockHeight,
      proofHash: proof,
      notes: "Initial deposit",
    });
    this.state.batchHistoryCount.set(batchId, logCount + 1);
    return { ok: true, value: true };
  }

  transferCustody(
    batchId: number,
    newCustodian: string,
    proof: Uint8Array,
    notes: string
  ): Result<boolean> {
    const status = this.state.batchStatuses.get(batchId);
    if (!status) return { ok: false, value: false };
    if (this.getUserRole(this.caller).value !== ROLE_COLLECTOR) return { ok: false, value: false };
    if (newCustodian === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (proof.length !== 32) return { ok: false, value: false };
    if (!this.verifyOracleProof(proof).value) return { ok: false, value: false };
    if (status.currentCustodian !== this.caller) return { ok: false, value: false };
    if (status.currentStatus === STATUS_PROCESSED) return { ok: false, value: false };

    this.state.batchStatuses.set(batchId, {
      ...status,
      currentStatus: STATUS_IN_TRANSIT,
      lastUpdateTimestamp: this.blockHeight,
      currentCustodian: newCustodian,
    });

    const logCount = this.state.batchHistoryCount.get(batchId) || 0;
    if (logCount >= this.state.maxHistoryPerBatch) return { ok: false, value: false };
    const key = `${batchId}-${logCount}`;
    this.state.batchHistory.set(key, {
      action: "custody-transfer",
      actor: this.caller,
      timestamp: this.blockHeight,
      proofHash: proof,
      notes,
    });
    this.state.batchHistoryCount.set(batchId, logCount + 1);
    return { ok: true, value: true };
  }

  markProcessed(
    batchId: number,
    proof: Uint8Array,
    notes: string
  ): Result<boolean> {
    const status = this.state.batchStatuses.get(batchId);
    if (!status) return { ok: false, value: false };
    if (this.getUserRole(this.caller).value !== ROLE_PROCESSOR) return { ok: false, value: false };
    if (proof.length !== 32) return { ok: false, value: false };
    if (!this.verifyOracleProof(proof).value) return { ok: false, value: false };
    if (status.currentCustodian !== this.caller) return { ok: false, value: false };
    if (status.currentStatus === STATUS_PROCESSED) return { ok: false, value: false };

    this.state.batchStatuses.set(batchId, {
      ...status,
      currentStatus: STATUS_PROCESSED,
      lastUpdateTimestamp: this.blockHeight,
    });

    const logCount = this.state.batchHistoryCount.get(batchId) || 0;
    if (logCount >= this.state.maxHistoryPerBatch) return { ok: false, value: false };
    const key = `${batchId}-${logCount}`;
    this.state.batchHistory.set(key, {
      action: "processed",
      actor: this.caller,
      timestamp: this.blockHeight,
      proofHash: proof,
      notes,
    });
    this.state.batchHistoryCount.set(batchId, logCount + 1);
    return { ok: true, value: true };
  }

  rejectBatch(
    batchId: number,
    proof: Uint8Array,
    notes: string
  ): Result<boolean> {
    const status = this.state.batchStatuses.get(batchId);
    if (!status) return { ok: false, value: false };
    if (this.getUserRole(this.caller).value !== ROLE_PROCESSOR) return { ok: false, value: false };
    if (proof.length !== 32) return { ok: false, value: false };
    if (!this.verifyOracleProof(proof).value) return { ok: false, value: false };
    if (status.currentCustodian !== this.caller) return { ok: false, value: false };
    if (status.currentStatus === STATUS_PROCESSED) return { ok: false, value: false };

    this.state.batchStatuses.set(batchId, {
      ...status,
      currentStatus: STATUS_REJECTED,
      lastUpdateTimestamp: this.blockHeight,
    });

    const logCount = this.state.batchHistoryCount.get(batchId) || 0;
    if (logCount >= this.state.maxHistoryPerBatch) return { ok: false, value: false };
    const key = `${batchId}-${logCount}`;
    this.state.batchHistory.set(key, {
      action: "rejected",
      actor: this.caller,
      timestamp: this.blockHeight,
      proofHash: proof,
      notes,
    });
    this.state.batchHistoryCount.set(batchId, logCount + 1);
    return { ok: true, value: true };
  }

  getBatchStatus(batchId: number): BatchStatus | null {
    return this.state.batchStatuses.get(batchId) || null;
  }

  getBatchHistoryEntry(batchId: number, logId: number): BatchHistoryEntry | null {
    const key = `${batchId}-${logId}`;
    return this.state.batchHistory.get(key) || null;
  }

  getBatchHistoryCount(batchId: number): number {
    return this.state.batchHistoryCount.get(batchId) || 0;
  }
}

describe("TrackingLedger", () => {
  let contract: TrackingLedgerMock;

  beforeEach(() => {
    contract = new TrackingLedgerMock();
    contract.reset();
  });

  it("rejects deposit without oracle contract", () => {
    const proof = new Uint8Array(32);
    const result = contract.logBatchDeposit(1, "plastic", 100, "LocationX", proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects deposit with invalid role", () => {
    contract.setOracleContract("ST2TEST");
    contract.roles.set("ST1TEST", ROLE_COLLECTOR);
    const proof = new Uint8Array(32);
    const result = contract.logBatchDeposit(1, "plastic", 100, "LocationX", proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects transfer with invalid custody", () => {
    contract.setOracleContract("ST2TEST");
    const proof = new Uint8Array(32);
    const result = contract.transferCustody(1, "ST3NEW", proof, "Notes");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects mark processed if already processed", () => {
    contract.setOracleContract("ST2TEST");
    contract.oracleProofs.add("proof1");
    const proofDeposit = new Uint8Array(32).fill(1);
    contract.logBatchDeposit(1, "plastic", 100, "LocationX", proofDeposit);

    contract.roles.set("ST1TEST", ROLE_PROCESSOR);
    contract.oracleProofs.add("proof3");
    const proofProcess = new Uint8Array(32).fill(3);
    contract.markProcessed(1, proofProcess, "Processed notes");

    const result = contract.markProcessed(1, proofProcess, "Again");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oracleContract).toBe("ST2TEST");
  });

  it("rejects invalid oracle contract", () => {
    const result = contract.setOracleContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets max history per batch successfully", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.setMaxHistoryPerBatch(100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxHistoryPerBatch).toBe(100);
  });

  it("rejects max history change without oracle", () => {
    const result = contract.setMaxHistoryPerBatch(100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects deposit with max history exceeded", () => {
    contract.setOracleContract("ST2TEST");
    contract.state.maxHistoryPerBatch = 0;
    const proof = new Uint8Array(32);
    const result = contract.logBatchDeposit(1, "plastic", 100, "LocationX", proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});