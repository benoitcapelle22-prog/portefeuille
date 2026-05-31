import { createBrowserRouter } from "react-router";
import { PortfolioLayout } from "./components/PortfolioLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { PositionSizePage } from "./pages/PositionSizePage";
import { TradePlanPage } from "./pages/TradePlanPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: PortfolioLayout,
    children: [
      { index: true, Component: DashboardPage },
      { path: "transactions", Component: TransactionsPage },
      { path: "calculator", Component: PositionSizePage },
      { path: "trade-plan", Component: TradePlanPage },
    ],
  },
]);