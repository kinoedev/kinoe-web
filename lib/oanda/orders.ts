// OANDA order placement — stop entry orders for KT / Big Shadow / Inside Bar.
// All three setups enter on a breakout of a level, so STOP orders are correct:
// they only fill when price moves through the trigger, never counter-trend.

export type PlaceOrderResult = {
  ok: boolean;
  orderId?: string;
  tradeId?: string;   // set immediately if order fills at market (rare for stops)
  filledPrice?: number;
  error?: string;
};

type OandaOrderBody = {
  order: {
    type: "STOP" | "MARKET_IF_TOUCHED" | "MARKET";
    instrument: string;
    units: string;
    price?: string;
    timeInForce: string;
    stopLossOnFill: { price: string; timeInForce: string };
    takeProfitOnFill: { price: string };
    trailingStopLossOnFill?: { distance: string };
  };
};

export async function placeStopOrder(
  accountId: string,
  apiKey: string,
  baseUrl: string,
  params: {
    instrument: string;
    direction: "LONG" | "SHORT";
    units: number;          // absolute number of units
    entryPrice: number;     // stop trigger level
    stopLoss: number;
    takeProfit: number;
  }
): Promise<PlaceOrderResult> {
  const signedUnits = params.direction === "LONG" ? params.units : -params.units;
  const pipDecimals = params.instrument.startsWith("XA") ? 2 : 5;

  const body: OandaOrderBody = {
    order: {
      type: "STOP",
      instrument: params.instrument,
      units: String(signedUnits),
      price: params.entryPrice.toFixed(pipDecimals),
      timeInForce: "GTC",
      stopLossOnFill: {
        price: params.stopLoss.toFixed(pipDecimals),
        timeInForce: "GTC",
      },
      takeProfitOnFill: {
        price: params.takeProfit.toFixed(pipDecimals),
      },
    },
  };

  try {
    const res = await fetch(`${baseUrl}/v3/accounts/${accountId}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      orderCreateTransaction?: { id?: string };
      orderFillTransaction?: { id?: string; tradeOpened?: { tradeID?: string }; price?: string };
      relatedTransactionIDs?: string[];
      errorMessage?: string;
      errorCode?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.errorMessage ?? data.errorCode ?? `OANDA error ${res.status}`,
      };
    }

    const orderId = data.orderCreateTransaction?.id;
    const fillTx = data.orderFillTransaction;
    const tradeId = fillTx?.tradeOpened?.tradeID;
    const filledPrice = fillTx?.price ? Number(fillTx.price) : undefined;

    return { ok: true, orderId, tradeId, filledPrice };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Order placement failed" };
  }
}

export async function cancelOrder(
  accountId: string,
  apiKey: string,
  baseUrl: string,
  orderId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${baseUrl}/v3/accounts/${accountId}/orders/${orderId}/cancel`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      }
    );
    return { ok: res.ok, error: res.ok ? undefined : `Cancel failed: ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cancel failed" };
  }
}
