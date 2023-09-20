(Base, { broadcastEnabled = false } = {}) => {
  const protoClass =
    broadcastEnabled === false
      ? Base
      : class extends Base {
          #channelName;
          #channel;
          #client;
          constructor(data = {}) {
            const { col, id, client } = data;
            super(...arguments);
            this.#client = client;
            if (id) this.initChannel({ col, id });
          }
          initChannel({ col, id } = {}) {
            if (!col) col = this.col();
            if (!id) id = this.id();
            if (!col || !id) throw new Error(`Required is not exist (col=${col}, id=${id})`);

            this.#channelName = `${col}-${id}`;
            this.#channel = lib.store.broadcaster.addChannel({ name: this.#channelName, instance: this });

            // !!! тут нужно восстановить информацию о себе у старых подписчиков
          }
          removeChannel() {
            if (this.#channel) {
              lib.store.broadcaster.removeChannel({ name: this.#channelName });
              this.#channelName = null;
              this.#channel = null;
            }
          }
          client() {
            return this.#client;
          }
          channel() {
            return this.#channel;
          }
          channelName() {
            return this.#channelName;
          }
          processAction(data) {
            const { actionName, actionData } = data;
            if (this[actionName]) this[actionName](actionData);
          }

          /**
           * Базовая функция класса для сохранения данных при получении обновлений
           * @param {*} data
           */
          processData(data) {
            throw new Error(`"processData" handler not created for channel (${this.#channelName})`);
          }
          subscribe(channelName, accessConfig) {
            lib.store.broadcaster.publishAction(channelName, 'addSubscriber', {
              subscriber: this.#channelName,
              accessConfig,
            });
          }
          unsubscribe(channelName) {
            lib.store.broadcaster.publishAction(channelName, 'deleteSubscriber', {
              subscriber: this.#channelName,
            });
          }
          async addSubscriber({ subscriber: subscriberChannel, accessConfig = {} }) {
            this.#channel.subscribers.set(subscriberChannel, { accessConfig });
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
          async broadcastData(data, config = {}) {
            const { customChannel } = config;

            if (typeof this.broadcastDataBeforeHandler === 'function') this.broadcastDataBeforeHandler(data, config);

            const subscribers = this.channel().subscribers.entries();
            for (const [subscriberChannel, { accessConfig = {} } = {}] of subscribers) {
              if (!customChannel || subscriberChannel === customChannel) {
                let publishData;
                const { rule = 'all', fields = [], pathRoot, path, userId } = accessConfig;
                switch (rule) {
                  /**
                   * фильтруем данные через кастомный обработчик
                   */
                  case 'custom':
                    if (!pathRoot || !path)
                      throw new Error(
                        `Custom rule handler path or pathRoot (subscriberChannel="${subscriberChannel}") not found`
                      );
                    const splittedPath = path.split('.');
                    const method = lib.utils.getDeep(pathRoot === 'domain' ? domain : lib, splittedPath);
                    if (typeof method !== 'function')
                      throw new Error(
                        `Custom rule handler (subscriberChannel="${subscriberChannel}", path="${path}") not found`
                      );
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
                await lib.store.broadcaster.publishData(subscriberChannel, this.wrapPublishData(publishData));
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
                lib.store.broadcaster.publishAction(subscriberChannel, name, data);
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

    constructor(data = {}) {
      const { col, id } = data;
      super(...arguments);
      this.#col = col;
      if (id) this.initStore(id);
    }
    id() {
      return this.#id;
    }
    col() {
      return this.#col;
    }
    preventSaveFields(data) {
      if (!data) return this.#preventSaveFields;
      this.#preventSaveFields = data;
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
      } else {
        let { id, query } = fromDB;
        if (!query && id) query = { _id: db.mongo.ObjectID(id) };
        if (query) {
          const dbData = await db.mongo.findOne(this.#col, query);
          if (dbData === null) {
            throw 'not_found';
          } else {
            Object.assign(this, dbData);
            if (!this.#id && initStore) {
              this.initStore(dbData._id);
              if (!this.channel()) this.initChannel();
            }
          }
        }
      }
      if (this._id) delete this._id; // не должно мешаться при сохранении в mongoDB
      return this;
    }
    async create(initialData = {}) {
      const { _id } = await db.mongo.insertOne(this.#col, initialData);

      if (!_id) {
        throw 'not_created';
      } else {
        Object.assign(this, initialData);
        this.initStore(_id);
        if (!this.channel()) this.initChannel();
      }
      if (this._id) delete this._id; // не должно мешаться при сохранении в mongoDB
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
        masterObj: this,
        target: this,
        source: val,
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
      // !!! тут возникает гонка (смотри публикации на клиенте при открытии лобби после перезагрузки браузера)

      const changes = this.getChanges();
      if (!Object.keys(changes).length) return;
      if (this.#id.length === 24) {
        const $update = { $set: {}, $unset: {} };
        const flattenChanges = lib.utils.flatten(changes);
        const changeKeys = Object.keys(flattenChanges);
        changeKeys.forEach((key, idx) => {
          if (this.#preventSaveFields.find((field) => key.indexOf(field) === 0)) return;

          // защита от ошибки MongoServerError: Updating the path 'XXX.YYY' would create a conflict at 'XXX'
          if (changeKeys[idx + 1]?.indexOf(`${key}.`) !== 0) {
            if (flattenChanges[key] === null) $update.$unset[key] = '';
            else $update.$set[key] = flattenChanges[key];
          }
        });
        if (Object.keys($update.$set).length === 0) delete $update.$set;
        if (Object.keys($update.$unset).length === 0) delete $update.$unset;
        if (Object.keys($update).length) {
          await db.mongo.updateOne(this.#col, { _id: db.mongo.ObjectID(this.#id) }, $update);
        }
      }
      if (typeof this.broadcastData === 'function') await this.broadcastData(changes);

      this.clearChanges();
    }
  };
};
