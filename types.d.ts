export class BroadcastableStore extends Store, Broadcastable {}

export class Store {
    #id: string;
    #col: string;
    #changes: {};
    #disableChanges: boolean;
    #preventSaveFields: string[];
    #updateActionsQueue: any[];
    #updateActionsEnabled: boolean;
    constructor(data: { col: string; id?: string });
    id(): string;
    col(): string;
    preventSaveFields(fields: string[]): string[];
    initStore(id: string): void;
    removeStore(): void;
    storeId(): string;
    load({ fromData, fromDB } = { fromData?: any, fromDB?: any }, { initStore: boolean }): Promise<any>;
    create(initialData?: any): Promise<any>;
    remove(): Promise<void>;
    setChanges(val: any, config?: any): void;
    set(val: any, config?: any): void;
    getChanges(): any;
    enableChanges(): void;
    disableChanges(): void;
    checkChangesDisabled(): boolean;
    clearChanges(): void;
    saveChanges(): Promise<void>;
    dumpState(): Promise<void>;
    loadFromDB({ query, fromDump }: { query?: any; fromDump?: any }): Promise<any>;
}

export class Broadcastable {
    #id: string;
    #col: string;
    #broadcastableFields: string[];
    #preventBroadcastFields: string[];
    #channelName: string;
    #channel: any;
    #client: any;
    constructor(data: { col: string; id?: string; client: any });
    initChannel({ col, id }?: { col?: string; id?: string }): void;
    removeChannel(): void;
    client(): any;
    channel(): any;
    channelName(name?: string): string;
    broadcastableFields(data?: string[]): string[];
    preventBroadcastFields(data?: string[]): string[];
    processAction(data: any): void;
    processData(data: any): void;
    subscribe(channelName: string, accessConfig: any): Promise<void>;
    unsubscribe(channelName: string): Promise<void>;
    addSubscriber({ subscriber, accessConfig }: { subscriber: string; accessConfig?: any }): Promise<void>;
    deleteSubscriber({ subscriber }: { subscriber: string }): void;
    prepareInitialDataForSubscribers(): any;
    wrapPublishData(data: any): { [x: string]: { [x: string]: any } };
    broadcastPrivateData(channelsMap: any, config?: {}): Promise<void>;
    broadcastData(originalData: any, config?: {}): Promise<void>;
    broadcastPrivateAction(name: string, channelsMap: any, config?: {}): void;
    broadcastAction(name: string, data: any, config?: { customChannel?: string }): void;
}