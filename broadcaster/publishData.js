async (channelName, data) => {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      processType: 'data',
      data,
    })
  );
  return result ? true : false;
};
