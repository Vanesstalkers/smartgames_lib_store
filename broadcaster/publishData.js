(async function publishData(channelName, data) {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      broadcaster: this.channelName?.(),
      processType: 'data',
      data,
    })
  );
  return result ? true : false;
})
