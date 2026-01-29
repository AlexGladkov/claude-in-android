import { WDAClient } from "./wda-client.js";
export declare class WDAManager {
    private instances;
    private clients;
    private readonly startupTimeout;
    private readonly buildTimeout;
    ensureWDAReady(deviceId: string): Promise<WDAClient>;
    private discoverWDA;
    private buildWDAIfNeeded;
    private launchWDA;
    private checkHealth;
    private findFreePort;
    cleanup(): void;
}
//# sourceMappingURL=wda-manager.d.ts.map