(Base, { broadcastEnabled = false } = {}) => {
  const protoClass =
    broadcastEnabled === false
      ? Base
      : class extends Base {
        #channelName;
        #channel;
        #client;
        #broadcastableFields = [];
        #preventBroadcastFields = [];

        constructor(data = {}) {
          const { col, id, client } = data;
          super(...arguments);
          this.#client = client;
          if (id) this.initChannel({ col, id });
        }
        initChannel({ col, id } = {}) {
          col = col || this.col();
          id = id || this.id();
          if (!col || !id) throw new Error(`Required is not exist (col=${col}, id=${id})`);

          if (!this.#channelName) this.#channelName = `${col}-${id}`;
          this.#channel = lib.store.broadcaster.addChannel({ name: this.#channelName, instance: this });

          // !!! тут нужно восстановить информацию о себе у старых подписчиков
        }
        removeChannel() {
          if (this.#channel) {
            lib.store.broadcaster.removeChannel({ name: this.#channelName });
            this.#channelName = this.#channel = null;
          }
        }
        client() {
          return this.#client;
        }
        channel() {
          return this.#channel;
        }
        channelName(name) {
          if (name) return (this.#channelName = name);
          return this.#channelName;
        }

        broadcastableFields(data) {
          const result = super.broadcastableFields?.(data);
          if (result) return result;

          if (!data) return this.#broadcastableFields;
          this.#broadcastableFields = data;
          return true;
        }
        preventBroadcastFields(data) {
          const result = super.preventBroadcastFields?.(data);
          if (result) return result;

          if (!data) return this.#preventBroadcastFields;
          this.#preventBroadcastFields = data;
          return true;
        }

        async processAction(data) {
          const { actionName, actionData } = data;
          if (this[actionName]) await this[actionName](actionData);
        }
        /**
         * Базовая функция класса для сохранения данных при получении обновлений
         * @param {*} data
         */
        async processData(data) {
          throw new Error(`"processData" handler not created for channel (${this.#channelName})`);
        }
        async subscribe(channelName, accessConfig) {
          await lib.store.broadcaster.publishAction.call(this, channelName, 'addSubscriber', {
            subscriber: this.#channelName,
            accessConfig,
          });
        }
        async unsubscribe(channelName) {
          await lib.store.broadcaster.publishAction.call(this, channelName, 'deleteSubscriber', {
            subscriber: this.#channelName,
          });
        }
        async addSubscriber({ subscriber: subscriberChannel, accessConfig = {} }) {
          await this.#channel.subscribers.set(subscriberChannel, { accessConfig });
          await this.broadcastData(this.prepareInitialDataForSubscribers(), { customChannel: subscriberChannel });
        }
        deleteSubscriber({ subscriber: subscriberChannel }) {
          this.#channel.subscribers.delete(subscriberChannel);
        }
        prepareInitialDataForSubscribers() {
          return this;
        }
        wrapPublishData(data) {
          return { [this.col()]: { [this.id()]: data } };
        }
        async broadcastPrivateData(channelsMap, config = {}) {
          for (const [channel, data] of Object.entries(channelsMap)) {
            await this.broadcastData(data, { ...config, customChannel: channel });
          }
        }

        /**
         * Выбирает способ подготовки данных и делает рассылку по всем подписчикам
         */
        async broadcastData(originalData, config = {}) {
          const { customChannel, wrapperDisabled = false } = config;

          const data = JSON.parse(JSON.stringify(originalData));

          if (typeof this.broadcastDataBeforeHandler === 'function') {
            this.broadcastDataBeforeHandler(data, config);
          }

          const channel = this.channel();
          if (!channel) {
            // канал могли уже закрыть
            console.error(`broadcastData to empty channel (col=${this.col()}, id=${this.id()}) with data:`, data);
          }
          const subscribers = channel ? channel.subscribers.entries() : [];
          for (const [subscriberChannel, { accessConfig = {} } = {}] of subscribers) {
            if (!customChannel || subscriberChannel === customChannel) {
              let publishData;
              const { rule = 'all', ruleHandler, fields = [] } = accessConfig;
              switch (rule) {
                /**
                 * фильтруем данные через кастомный обработчик
                 */
                case 'custom':
                  const notFoundErr = new Error(
                    `Custom rule handler (subscriberChannel="${subscriberChannel}") not found, ruleHandler="${ruleHandler}") not found`
                  );
                  if (!ruleHandler) throw notFoundErr;

                  const splittedPath = ['game', 'rules', ruleHandler];
                  let method = lib.utils.getDeep(domain, splittedPath);
                  if (!method) method = lib.utils.getDeep(lib, splittedPath);
                  if (typeof method !== 'function') throw notFoundErr;

                  publishData = method(data);
                  break;
                /**
                 * отправляем только выбранные поля (и вложенные в них объекты)
                 */
                case 'fields':
                  publishData = Object.fromEntries(
                    Object.entries(data).filter(([key, value]) =>
                      fields.find((field) => key === field || key.indexOf(field + '.') === 0)
                    )
                  );
                  break;
                /**
                 * отправляем данные в формате хранилища на клиенте
                 */
                case 'vue-store':
                  publishData =
                    typeof this.broadcastDataVueStoreRuleHandler === 'function'
                      ? this.broadcastDataVueStoreRuleHandler(data, { accessConfig })
                      : data;
                  break;
                /**
                 * только события
                 */
                case 'actions-only':
                  publishData = {};
                  break;
                case 'all':
                default:
                  publishData = data;
              }
              if (!Object.keys(publishData).length) continue;

              const wrappedData = wrapperDisabled ? publishData : this.wrapPublishData(publishData);
              await lib.store.broadcaster.publishData.call(this, subscriberChannel, wrappedData);
            }
          }

          if (typeof this.broadcastDataAfterHandler === 'function') this.broadcastDataAfterHandler(data, config);
        }
        broadcastPrivateAction(name, channelsMap, config = {}) {
          for (const [channel, data] of Object.entries(channelsMap)) {
            this.broadcastAction(name, data, { ...config, customChannel: channel });
          }
        }
        broadcastAction(name, data, { customChannel } = {}) {
          for (const [subscriberChannel, { accessConfig = {} } = {}] of this.#channel.subscribers.entries()) {
            if (!customChannel || subscriberChannel === customChannel) {
              lib.store.broadcaster.publishAction.call(this, subscriberChannel, name, data);
            }
          }
        }
      };

  return class extends protoClass {
    #id;
    #col;
    #changes = {};
    #disableChanges = false;
    #preventSaveFields = [];
    #saveQueue = [];
    #isProcessing = false;
    #processingPromise = null;

    constructor(data = {}) {
      const { col, id } = data;
      super(...arguments);
      this.#col = col;
      this.#id = undefined;
      if (id) this.initStore(id);

      this.preventSaveFields(['eventListeners']);
    }
    id() {
      let id;
      try {
        id = this.#id;
      } catch (err) {}
      if (!id) id = super.id();
      return id;
    }
    col() {
      return this.#col;
    }
    preventSaveFields(fields) {
      const result = super.preventSaveFields?.(fields);
      if (result) return result;

      if (!fields) return this.#preventSaveFields;
      this.#preventSaveFields.push(...fields);
      return true;
    }
    initStore(id) {
      this.#id = id.toString();
      lib.store(this.#col).set(this.#id, this);
    }
    removeStore() {
      lib.store(this.#col).delete(this.#id);
    }
    storeId() {
      return this.#col + '-' + this.#id;
    }
    async load({ fromData = null, fromDB = {} }, { initStore = true } = {}) {
      if (fromData) {
        Object.assign(this, fromData);
        if (initStore) this.initStore(this._id);
      } else {
        let { id, query, processData, fromDump = false } = fromDB;
        if (typeof processData !== 'function') processData = async (data) => Object.assign(this, data);
        if (!query && id) query = { _id: db.mongo.ObjectID(id) };

        if (query) {
          const loadedData = await this.loadFromDB({ query, fromDump });
          if (loadedData === null) {
            throw 'not_found';
          } else {
            await processData.call(this, loadedData);
            if (!this.#id && initStore) {
              this.initStore(loadedData._id);
              if (!this.channel()) this.initChannel();
            }
          }
        }
      }
      return this;
    }
    async create(initialData = {}) {
      let dbData = initialData;
      const preventSaveFieldsList = this.preventSaveFields();
      if (preventSaveFieldsList.length) {
        dbData = Object.fromEntries(
          Object.entries(dbData).filter(([key, val]) => !preventSaveFieldsList.includes(key))
        );
      }
      if (dbData.store) {
        const storeData = {};
        for (const [col, ids] of Object.entries(dbData.store)) {
          storeData[col] = {};
          for (const [id, obj] of Object.entries(ids)) {
            storeData[col][id] = obj.prepareSaveData ? obj.prepareSaveData() : obj;
          }
        }
        dbData = { ...dbData, store: storeData };
      }

      const { _id } = await db.mongo.insertOne(this.#col, dbData);

      if (!_id) {
        throw 'not_created';
      } else {
        Object.assign(this, initialData);
        this.initStore(_id);
        if (!this.channel()) this.initChannel();
      }
      return this;
    }
    async remove() {
      this.removeStore();
      this.removeChannel();
    }
    setChanges(val, config = {}) {
      if (this.#disableChanges) return;
      lib.utils.mergeDeep({
        masterObj: config.masterObject || this,
        target: this.#changes,
        source: lib.utils.structuredClone(val),
        config, // все получатели #changes должны знать об удаленных ключах, поэтому ключи с null-значением сохраняем (по дефолту deleteNull = false)
      });
    }
    set(val, config = {}) {
      this.setChanges(val, config);
      lib.utils.mergeDeep({
        ...{ masterObj: this, target: this, source: val },
        config: { deleteNull: true, ...config }, // удаляем ключи с null-значением
      });
    }
    getChanges() {
      return this.#changes;
    }
    /**
     * Включает авто-контроль за изменениями (для последующего сохранения и рассылки)
     */
    enableChanges() {
      this.#disableChanges = false;
    }
    /**
     * Выключает авто-контроль за изменениями (для последующего сохранения и рассылки)
     */
    disableChanges() {
      this.#disableChanges = true;
    }
    checkChangesDisabled() {
      return this.#disableChanges;
    }
    clearChanges() {
      this.#changes = {};
    }
    async saveChanges() {
      const changes = this.getChanges();
      this.clearChanges();
      if (!Object.keys(changes).length) return;

      this.#saveQueue.push(changes);

      // Если уже обрабатывается, ждем завершения
      if (this.#isProcessing) {
        return this.#processingPromise;
      }

      // Начинаем обработку
      this.#isProcessing = true;
      this.#processingPromise = this.#processQueue();

      return this.#processingPromise;
    }

    async #processQueue() {
      try {
        while (this.#saveQueue.length > 0) {
          const changes = this.#saveQueue.shift();

          const $update = { $set: {}, $unset: {} };
          const flattenChanges = lib.utils.flatten(changes);
          const changeKeys = Object.keys(flattenChanges);
          const preventSaveFieldsList = this.preventSaveFields();
          changeKeys.forEach((key, idx) => {
            if (preventSaveFieldsList.find((field) => key.indexOf(field) === 0)) return;

            // защита от ошибки MongoServerError: Updating the path 'XXX.YYY' would create a conflict at 'XXX'
            if (changeKeys[idx + 1]?.indexOf(`${key}.`) !== 0) {
              if (flattenChanges[key] === null) $update.$unset[key] = '';
              else $update.$set[key] = flattenChanges[key];
            }
          });

          if (Object.keys($update.$set).length === 0) delete $update.$set;
          if (Object.keys($update.$unset).length === 0) delete $update.$unset;
          if (Object.keys($update).length) {
            await db.mongo.updateOne(this.#col, { _id: db.mongo.ObjectID(this.#id) }, $update).catch((err) => {
              console.error('Error in processQueue:', { err, $update, col: this.#col, id: this.#id });
              throw err;
            });
          }
          if (typeof this.broadcastData === 'function') await this.broadcastData(changes);

        }
      } catch (error) {
        console.error('Error in processQueue:', error);
        throw error;
      } finally {
        // Гарантированно сбрасываем флаги
        this.#isProcessing = false;
        this.#processingPromise = null;
      }
    }
    async loadFromDB({ query, fromDump }) {
      const col = this.col();
      const _id = db.mongo.ObjectID(query._id);

      if (!fromDump) return await db.mongo.findOne(col, query);

      query._gameid = _id;
      delete query._id;
      const [
        dumpData, // берем первый элемент, т.к. в ответе массив
      ] = await db.mongo.find(col + '_dump', query, {
        ...{ sort: { round: -1, _dumptime: -1 }, limit: 1 },
      });

      await db.mongo.deleteOne(col, { _id });

      dumpData._id = _id;
      delete dumpData._gameid;
      await db.mongo.insertOne(col, dumpData);

      return dumpData;
    }
  };
};
