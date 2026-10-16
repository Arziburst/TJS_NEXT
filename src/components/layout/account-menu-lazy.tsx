"use client";

import dynamic from "next/dynamic";

/*
 * The signed-in user's menu as a chunk of its own (#105): Base UI's menu and its positioning load only on a page
 * that renders the menu, never for a guest, whose slot is the sign-in link. Server-rendered as before.
 */
export const AccountMenuClient = dynamic(() => import("./account-menu-client").then((module) => module.AccountMenuClient));
