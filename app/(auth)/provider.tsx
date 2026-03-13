"use client";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { UserDetailContext } from "@/context/UserDetailContext";
import Header from "../_components/Header";

type UserDetail = {
  id: number;
  email: string;
  name: string;
  credits?: number;
};

const Provider = ({ children }: { children: React.ReactNode }) => {
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUserDetail(parsed);
        axios.defaults.headers.common["x-user-email"] = parsed.email;
      } catch {
        localStorage.removeItem("user");
      }
    }
  }, []);

  useEffect(() => {
    if (userDetail?.email) {
      axios.defaults.headers.common["x-user-email"] = userDetail.email;
    } else {
      delete axios.defaults.headers.common["x-user-email"];
    }
  }, [userDetail]);

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
