"use client";

import { Button } from "@/components/ui/button";
// Clerk imports commented out — replaced with JWT auth via UserDetailContext
// import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import React, { useContext } from "react";
import { UserDetailContext } from "@/context/UserDetailContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";

const Header = () => {
  // JWT auth: read user from context (set by Provider via /api/auth/me)
  const { userDetail, setUserDetail } = useContext(UserDetailContext);
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("user");
    delete axios.defaults.headers.common["x-user-email"];
    setUserDetail(null);
    router.push("/sign-in");
  };

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex gap-2 items-center">
        <Image src={"/logo.png"} alt="logo" width={45} height={45} />
        <h2 className="text-xl font-bold">
          <span className="text-primary">Vid</span>Course
        </h2>
      </div>

      <ul className="flex gap-8 text-center">
        <li className="text-lg hover:text-primary cursor-pointer font-medium">
          Home
        </li>
        <li className="text-lg hover:text-primary cursor-pointer font-medium">
          Pricing
        </li>
      </ul>

      {userDetail ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {userDetail.name}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      ) : (
        // Previously: <SignInButton mode="modal"><Button>Get Started</Button></SignInButton>
        <Link href="/sign-in">
          <Button>Get Started</Button>
        </Link>
      )}
    </div>
  );
};

export default Header;
