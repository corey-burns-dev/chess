using Moq;
using Microsoft.AspNetCore.SignalR;
using Backend.Hubs;
using ChessDotNet;
using Xunit;

namespace Backend.Tests;

public class GameHubTests
{
    private readonly Mock<IHubCallerClients> _mockClients;
    private readonly Mock<ISingleClientProxy> _mockCallerProxy;
    private readonly Mock<ISingleClientProxy> _mockOtherProxy;
    private readonly Mock<IGroupManager> _mockGroups;
    private readonly Mock<HubCallerContext> _mockContext;
    private readonly GameHub _hub;

    public GameHubTests()
    {
        _mockClients = new Mock<IHubCallerClients>();
        _mockCallerProxy = new Mock<ISingleClientProxy>();
        _mockOtherProxy = new Mock<ISingleClientProxy>();
        _mockGroups = new Mock<IGroupManager>();
        _mockContext = new Mock<HubCallerContext>();

        _hub = new GameHub
        {
            Clients = _mockClients.Object,
            Groups = _mockGroups.Object,
            Context = _mockContext.Object
        };

        _mockClients.Setup(c => c.Caller).Returns(_mockCallerProxy.Object);
        _mockClients.Setup(c => c.Client(It.IsAny<string>())).Returns(_mockOtherProxy.Object);
    }

    [Fact]
    public async Task FindGame_FirstPlayer_EnqueuesAndWaits()
    {
        _mockContext.Setup(c => c.ConnectionId).Returns("player1");
        await _hub.FindGame();
        _mockCallerProxy.Verify(
            c => c.SendCoreAsync("WaitingForOpponent", It.IsAny<object[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task FindGame_SecondPlayer_StartsGame()
    {
        _mockContext.Setup(c => c.ConnectionId).Returns("player1");
        await _hub.FindGame();

        _mockContext.Setup(c => c.ConnectionId).Returns("player2");
        await _hub.FindGame();

        _mockOtherProxy.Verify(
            c => c.SendCoreAsync("GameStarted", It.IsAny<object[]>(), default),
            Times.AtLeast(2));
    }
}
