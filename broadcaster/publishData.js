async (channelName, data, processOwner) => {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      processType: 'data',
      processOwner,
      data,
    })
  );
  return result ? true : false;
};
