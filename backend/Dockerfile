# --- Build/Dev Base ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS base
WORKDIR /app
COPY ["Backend.csproj", "./"]
RUN dotnet restore /p:AllowMissingPrunePackageData=true
COPY . .

# --- Development Stage ---
FROM base AS development
EXPOSE 8080
# Enable hot reload
ENV DOTNET_WATCH_RESTART_ON_RUDE_EDIT=true
CMD ["dotnet", "watch", "run", "--urls", "http://+:8080", "--no-launch-profile"]

# --- Publish Stage ---
FROM base AS build
RUN dotnet publish "Backend.csproj" -c Release -o /app/publish /p:UseAppHost=false /p:AllowMissingPrunePackageData=true

# --- Runtime Stage ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS production
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Backend.dll"]
