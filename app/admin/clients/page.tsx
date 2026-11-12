import AdminNav from "@/components/AdminNav";
import CustomerMemoryAdmin from "@/components/CustomerMemoryAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminClientsPage() {
  return (
    <main className="wrap">
      <AdminNav />
      <h1 style={{ margin: "0 0 20px", fontSize: 28 }}>Mémoire clients</h1>
      <CustomerMemoryAdmin />
    </main>
  );
}
