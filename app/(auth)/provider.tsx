"use client";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { UserDetailContext } from "@/context/UserDetailContext";
import Header from "../_components/Header";

const Provider = ({ children }: { children: React.ReactNode }) => {
  const [userDetail, setUserDetail] = useState(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // JWT auth: fetch user from JWT cookie via /api/auth/me
  // Previously called POST /api/user using Clerk's currentUser()
  const fetchCurrentUser = async () => {
    try {
      const result = await axios.get("/api/auth/me");
      setUserDetail(result.data);
    } catch {
      // Not authenticated — user stays null
      setUserDetail(null);
    }
  };

  return (
    <div>
      <UserDetailContext.Provider value={{ userDetail, setUserDetail }}>
        <div className="max-w-7xl mx-auto">
          <Header />
          {children}
        </div>
      </UserDetailContext.Provider>
    </div>
  );
};

export default Provider;
