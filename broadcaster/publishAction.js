async (channelName, actionName, actionData, processOwner) => {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      processType: 'action',
      processOwner,
      actionName,
      actionData,
    })
  );
  return result ? true : false;
};
