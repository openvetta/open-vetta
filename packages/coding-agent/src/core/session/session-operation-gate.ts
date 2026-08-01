/** Admission boundary for work that belongs to the current Session identity. */
export interface SessionOperationGate {
	startSessionOperation<T>(operation: () => Promise<T>): Promise<T>;
	runImmediateSessionOperation<T>(operation: () => T): T;
}
