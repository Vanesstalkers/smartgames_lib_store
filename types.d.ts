export interface BroadcasterClass {
    initChannel: (options: { col: string; id: string }) => void;
    removeChannel: () => void;
    client: () => any;
    channel: () => any;
    channelName: (name: string) => string;
    broadcastableFields: (data: any) => any;
    preventBroadcastFields: (data: any) => any;
    processAction: (data: any) => void;
    processData: (data: any) => void;
    subscribe: (channelName: string, accessConfig: any) => void;
    addSubscriber: (options: { subscriber: string; accessConfig: any }) => void;
    deleteSubscriber: (options: { subscriber: string }) => void;
    prepareInitialDataForSubscribers: () => void;
    wrapPublishData: (data: any) => any;
    broadcastPrivateData: (channelsMap: any, config: any) => void;
    broadcastData: (originalData: any, config: any) => void;
    broadcastPrivateAction: (name: string, channelsMap: any, config: any) => void;
    broadcastAction: (name: string, data: any, config: any) => void;
}

// Интерфейс для функциональности хранилища
export interface StoreClass {
  // Методы для работы с ID и коллекцией
  id: () => string;
  col: () => string;
  
  // Методы для работы с хранилищем
  initStore: (id: string) => void;
  removeStore: () => void;
  storeId: () => string;
  
  // Методы для загрузки и сохранения
  load: (options?: { fromData?: any; fromDB?: any }, config?: { initStore?: boolean }) => Promise<any>;
  create: (initialData?: any) => Promise<any>;
  remove: () => Promise<void>;
  
  // Методы для работы с изменениями
  set: (val: any, config?: any) => void;
  setChanges: (val: any, config?: any) => void;
  getChanges: () => any;
  enableChanges: () => void;
  disableChanges: () => void;
  checkChangesDisabled: () => boolean;
  clearChanges: () => void;
  saveChanges: () => Promise<void>;
  
  // Методы для работы с полями
  preventSaveFields: (fields: string[]) => string[];
  
  // Методы для работы с БД
  loadFromDB: (options: { query?: any; fromDump?: any }) => Promise<any>;
  dumpState: () => Promise<void>;
}

// Тип для функции lib.store.class
export type StoreClassFactory = (Base: any, options?: { broadcastEnabled?: boolean }) => any;
