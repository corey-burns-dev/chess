using Backend.Services;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddSignalR();
builder.Services.AddSingleton<StockfishService>();

// CORS origins are driven by config so we don't need to redeploy for domain changes.
var allowedOrigins = builder.Configuration
    .GetSection("AllowedOrigins")
    .Get<string[]>() ?? ["http://localhost:3000"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // Required for SignalR
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

app.MapHub<Backend.Hubs.GameHub>("/gamehub");

// AI endpoint
app.MapPost("/api/ai/move", async ([FromBody] AiMoveRequest request, StockfishService stockfish) =>
{
    var bestMove = await stockfish.GetBestMoveAsync(request.Fen, request.SkillLevel, request.MovetimeMs);
    if (bestMove == null)
    {
        return Results.BadRequest("AI failed to find a move.");
    }
    return Results.Ok(new { bestMove });
});

app.Run();

public record AiMoveRequest(string Fen, int SkillLevel, int MovetimeMs);
