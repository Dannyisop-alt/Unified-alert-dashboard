export const DashboardHeader = () => {
  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto px-6 py-8">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Qryde Heartbeat
          </h1>
          <p className="text-muted-foreground text-lg">
            Enterprise monitoring dashboard for real-time system alerts and health monitoring
          </p>
        </div>
      </div>
    </header>
  );
};