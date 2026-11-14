"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export function SalesChart({
  data,
  currency,
}: {
  data: { label: string; sales: number; profit: number }[];
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
        <XAxis dataKey="label" fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} ${currency}`} />
        <Legend />
        <Bar dataKey="sales" name="Sales" fill="#0f1f38" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProfitChart({
  data,
  currency,
}: {
  data: { label: string; profit: number }[];
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
        <XAxis dataKey="label" fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} ${currency}`} />
        <Line type="monotone" dataKey="profit" name="Net profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
