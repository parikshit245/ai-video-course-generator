// Clerk SignUp component commented out — replaced with JWT sign-up form
// import { SignUp } from '@clerk/nextjs'
// export default function Page() {
//   return <div className='flex h-full mt-10 item-center justify-center'><SignUp /></div>
// }

"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useContext } from "react";
import { UserDetailContext } from "@/context/UserDetailContext";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUserDetail } = useContext(UserDetailContext);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post("/api/auth/register", {
        name,
        email,
        password,
      });
      const userData = result.data;
      localStorage.setItem("user", JSON.stringify(userData));
      axios.defaults.headers.common["x-user-email"] = userData.email;
      setUserDetail(userData);

      const redirect = searchParams.get("redirect");
      const redirectPath = redirect?.startsWith("/") ? redirect : "/";

      toast.success("Account created successfully!");
      router.push(redirectPath);
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.error || "Registration failed"
          : "Registration failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-xl shadow-sm bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            <span className="text-primary">Vid</span>Course
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-primary font-medium hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
