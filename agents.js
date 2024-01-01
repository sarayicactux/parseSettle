const getAgents = async (username) => {
  let user,
    tmpAgents = [];
  const agent = await agents.findOne({ username });
  if (agent)
    user = await database
      .collection(accessLevels[agent.access_level])
      .findOne({ mobile: username });
  if (!user) user = await members.findOne({ mobile: username });

  while (true) {
    if (!user) break;
    if (user.mobile == user.registrant) break;
    tmpAgents.push(user.registrant);
    const agent = await agents.findOne({ username: user.registrant });
    if (!agent) break;
    user = await database
      .collection(accessLevels[agent.access_level])
      .findOne({ mobile: user.registrant });
  }
  return tmpAgents;
};

module.exports.getAgents = getAgents;
